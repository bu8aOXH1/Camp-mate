import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const PAGE_WIDTH = 2480;
const PAGE_HEIGHT = 3508;
const HEADER_HEIGHT = 320;
const FOOTER_HEIGHT = 260;
const PAGE_PADDING = 140;
const CONTENT_MAX_HEIGHT = PAGE_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - PAGE_PADDING * 2;

const palette = {
  primary: "#f28c28",
  navy: "#1b2a5a",
  sky: "#d7ecff",
  accent: "#ff5ca8",
  ink: "#1c1c1c",
  muted: "#667085"
};

const sampleAnnouncements = [
  {
    id: "announcement-001",
    agencyName: "สำนักงานพัฒนาสังคมและความมั่นคงของมนุษย์",
    title: "ประกาศขอรับบริจาค",
    date: "15 กันยายน 2567",
    logoUrl: "",
    contact: "โทร. 02-123-4567 | email: donation@agency.go.th",
    qrUrl: "",
    items: [
      {
        category: "เครื่องนุ่งห่ม",
        name: "ชุดนักเรียนระดับประถม",
        description:
          "สำหรับนักเรียนที่ได้รับผลกระทบจากน้ำท่วม ขนาด 120-160 ซม. ขอความร่วมมือส่งมอบภายในเดือนนี้ พร้อมตรวจสอบความสะอาดและสภาพพร้อมใช้งาน",
        quantity: "200 ชุด",
        imageUrl: ""
      },
      {
        category: "เครื่องอุปโภคบริโภค",
        name: "ชุดเครื่องนอน",
        description:
          "ประกอบด้วย ผ้าห่ม, มุ้ง, และที่นอนปิคนิค เพื่อจัดทำศูนย์พักพิงชั่วคราว",
        quantity: "150 ชุด",
        imageUrl: ""
      },
      {
        category: "อาหารแห้ง",
        name: "ข้าวสารบรรจุถุง 5 กก.",
        description:
          "จัดทำเป็นถุงยังชีพสำหรับชุมชนห่างไกล กรุณาระบุวันที่ผลิตชัดเจน",
        quantity: "300 ถุง",
        imageUrl: ""
      }
    ]
  }
];

const placeholderSvg = (label) => {
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="720" height="520" viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#d7ecff" />
        <stop offset="100%" stop-color="#f6fbff" />
      </linearGradient>
    </defs>
    <rect width="720" height="520" fill="url(#g)" stroke="#1b2a5a" stroke-width="6" rx="28" />
    <circle cx="100" cy="100" r="48" fill="#f28c28" />
    <rect x="160" y="70" width="420" height="60" rx="12" fill="#1b2a5a" opacity="0.85" />
    <rect x="160" y="155" width="360" height="40" rx="10" fill="#ff5ca8" opacity="0.75" />
    <rect x="80" y="250" width="560" height="180" rx="18" fill="#ffffff" stroke="#1b2a5a" stroke-width="3" />
    <text x="360" y="355" font-family="Sarabun, TH Sarabun New, sans-serif" font-size="34" fill="#1b2a5a" text-anchor="middle">
      ${safeLabel}
    </text>
    <text x="360" y="400" font-family="Sarabun, TH Sarabun New, sans-serif" font-size="22" fill="#667085" text-anchor="middle">
      ภาพประกอบแบบราชการ
    </text>
  </svg>`;
};

const toBase64 = async (url) => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const buildFacebookText = (announcement) => {
  const lines = [
    `${announcement.title}`,
    `หน่วยงาน: ${announcement.agencyName}`,
    `วันที่ประกาศ: ${announcement.date}`,
    "",
    "📌 รายการที่ต้องการรับบริจาค"
  ];
  announcement.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. [${item.category}] ${item.name} (${item.quantity})`,
      `   ${item.description}`
    );
  });
  lines.push(
    "",
    "โปรดส่งมอบสิ่งของตามช่องทางด้านล่าง",
    announcement.contact
  );
  return lines.join("\n");
};

const buildChecklistRows = (announcement) =>
  announcement.items.map((item, index) => ({
    no: index + 1,
    category: item.category,
    name: item.name,
    quantity: item.quantity,
    received: "",
    remark: ""
  }));

const App = () => {
  const [inputValue, setInputValue] = useState(JSON.stringify(sampleAnnouncements, null, 2));
  const [announcements, setAnnouncements] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const measureRef = useRef(null);

  const prepareAnnouncements = async (rawAnnouncements) => {
    const prepared = await Promise.all(
      rawAnnouncements.map(async (announcement) => {
        const preparedItems = await Promise.all(
          announcement.items.map(async (item) => {
            if (item.imageUrl) {
              const base64 = await toBase64(item.imageUrl);
              return { ...item, resolvedImage: base64 };
            }
            const label = `${item.category} · ${item.name}`;
            const svg = placeholderSvg(label);
            return { ...item, resolvedImage: `data:image/svg+xml;base64,${btoa(svg)}` };
          })
        );
        return { ...announcement, items: preparedItems };
      })
    );
    return prepared;
  };

  const applyInput = async () => {
    setLoading(true);
    setError("");
    try {
      const parsed = JSON.parse(inputValue);
      const prepared = await prepareAnnouncements(parsed);
      setAnnouncements(prepared);
    } catch (err) {
      setError("รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบ JSON อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    applyInput();
  }, []);

  const exportChecklistPdf = async (announcement) => {
    const checklistElement = document.querySelector(
      `[data-checklist-id='${announcement.id}']`
    );
    if (!checklistElement) return;
    const canvas = await html2canvas(checklistElement, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "px", [PAGE_WIDTH, PAGE_HEIGHT]);
    pdf.addImage(imgData, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    pdf.save(`${announcement.id}-checklist.pdf`);
  };

  const exportAnnouncementAssets = async (announcement) => {
    const pageNodes = Array.from(
      document.querySelectorAll(`[data-announcement='${announcement.id}'] .page`)
    );
    if (pageNodes.length === 0) return;
    const pdf = new jsPDF("p", "px", [PAGE_WIDTH, PAGE_HEIGHT]);

    for (let i = 0; i < pageNodes.length; i += 1) {
      const canvas = await html2canvas(pageNodes[i], { scale: 2 });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) {
        pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], "p");
      }
      pdf.addImage(imgData, "JPEG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `${announcement.id}-page-${i + 1}.jpg`;
      link.click();
    }
    pdf.save(`${announcement.id}.pdf`);
  };

  const exportBatchZip = async () => {
    const zip = new JSZip();
    for (const announcement of announcements) {
      const pageNodes = Array.from(
        document.querySelectorAll(`[data-announcement='${announcement.id}'] .page`)
      );
      if (pageNodes.length === 0) continue;
      const pdf = new jsPDF("p", "px", [PAGE_WIDTH, PAGE_HEIGHT]);

      for (let i = 0; i < pageNodes.length; i += 1) {
        const canvas = await html2canvas(pageNodes[i], { scale: 2 });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) {
          pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], "p");
        }
        pdf.addImage(imgData, "JPEG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        const base64Data = imgData.split(",")[1];
        zip.file(`${announcement.id}/poster-page-${i + 1}.jpg`, base64Data, { base64: true });
      }
      zip.file(`${announcement.id}/poster.pdf`, pdf.output("arraybuffer"));
      zip.file(`${announcement.id}/facebook.txt`, buildFacebookText(announcement));

      const checklistElement = document.querySelector(
        `[data-checklist-id='${announcement.id}']`
      );
      if (checklistElement) {
        const canvas = await html2canvas(checklistElement, { scale: 2 });
        const imgData = canvas.toDataURL("image/png");
        const checklistPdf = new jsPDF("p", "px", [PAGE_WIDTH, PAGE_HEIGHT]);
        checklistPdf.addImage(imgData, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        zip.file(`${announcement.id}/checklist.pdf`, checklistPdf.output("arraybuffer"));
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "donation-announcements.zip");
  };

  return (
    <div className="app">
      <aside className="panel">
        <div className="panel-header">
          <h1>Donation Announcement Generator</h1>
          <p>
            ระบบประกาศรับบริจาคสำหรับหน่วยงานราชการ (รองรับหลายชุดประกาศ)
          </p>
        </div>
        <div className="input-section">
          <label htmlFor="json-input">Input JSON</label>
          <textarea
            id="json-input"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <div className="button-row">
            <button type="button" onClick={() => setInputValue(JSON.stringify(sampleAnnouncements, null, 2))}>
              โหลดตัวอย่าง
            </button>
            <button type="button" onClick={applyInput} disabled={loading}>
              {loading ? "กำลังประมวลผล..." : "สร้างประกาศ"}
            </button>
          </div>
        </div>
        <div className="batch-actions">
          <button type="button" className="primary" onClick={exportBatchZip}>
            Batch Export ZIP
          </button>
        </div>
        <div className="info-box">
          <h2>Output ที่ได้</h2>
          <ul>
            <li>Poster PDF/JPG A4 พร้อม Header/Footer คงที่</li>
            <li>ข้อความประชาสัมพันธ์ Facebook</li>
            <li>Print Checklist สำหรับตรวจรับ</li>
            <li>Batch Export เป็น ZIP</li>
          </ul>
        </div>
      </aside>
      <main className="preview">
        {announcements.map((announcement) => (
          <AnnouncementPreview
            key={announcement.id}
            announcement={announcement}
            measureRef={measureRef}
            onExport={() => exportAnnouncementAssets(announcement)}
            onChecklist={() => exportChecklistPdf(announcement)}
          />
        ))}
        <div ref={measureRef} className="measure-container" aria-hidden="true" />
      </main>
    </div>
  );
};

const AnnouncementPreview = ({ announcement, measureRef, onExport, onChecklist }) => {
  const [pages, setPages] = useState([]);

  const buildBlockElement = (item, options = {}) => {
    const block = document.createElement("div");
    block.className = "content-block";
    if (options.continuation) {
      block.classList.add("continuation");
    }
    const image = document.createElement("div");
    image.className = "content-image";
    const imageEl = document.createElement("img");
    imageEl.src = item.resolvedImage;
    image.appendChild(imageEl);

    const text = document.createElement("div");
    text.className = "content-text";
    const badge = document.createElement("span");
    badge.className = "category-badge";
    badge.textContent = item.category;
    const title = document.createElement("h3");
    title.textContent = item.name;
    const desc = document.createElement("p");
    desc.textContent = item.description;
    const qty = document.createElement("div");
    qty.className = "quantity";
    qty.textContent = `จำนวนที่ต้องการ: ${item.quantity}`;
    const info = document.createElement("div");
    info.className = "description";
    info.appendChild(desc);

    text.appendChild(badge);
    text.appendChild(title);
    text.appendChild(info);
    text.appendChild(qty);

    block.appendChild(image);
    block.appendChild(text);
    return block;
  };

  const measureHeight = (item, options = {}) => {
    if (!measureRef.current) return 0;
    const block = buildBlockElement(item, options);
    measureRef.current.appendChild(block);
    const height = block.offsetHeight;
    measureRef.current.removeChild(block);
    return height;
  };

  const splitOversizeItem = (item) => {
    const words = item.description.split(" ");
    let cursor = 0;
    const parts = [];
    while (cursor < words.length) {
      let end = cursor;
      let lastGood = cursor;
      while (end < words.length) {
        const description = words.slice(cursor, end + 1).join(" ");
        const height = measureHeight({ ...item, description }, { continuation: cursor > 0 });
        if (height <= CONTENT_MAX_HEIGHT) {
          lastGood = end;
          end += 1;
        } else {
          break;
        }
      }
      if (lastGood === cursor) {
        lastGood = Math.min(cursor + 8, words.length - 1);
      }
      parts.push({
        ...item,
        description: words.slice(cursor, lastGood + 1).join(" "),
        continuation: cursor > 0
      });
      cursor = lastGood + 1;
    }
    return parts;
  };

  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const computedPages = [];
    let currentPage = [];
    let currentHeight = 0;

    announcement.items.forEach((item) => {
      const blockHeight = measureHeight(item);
      if (blockHeight > CONTENT_MAX_HEIGHT) {
        const parts = splitOversizeItem(item);
        parts.forEach((part) => {
          const partHeight = measureHeight(part, { continuation: part.continuation });
          if (currentHeight + partHeight > CONTENT_MAX_HEIGHT) {
            computedPages.push(currentPage);
            currentPage = [];
            currentHeight = 0;
          }
          currentPage.push(part);
          currentHeight += partHeight;
        });
      } else if (currentHeight + blockHeight > CONTENT_MAX_HEIGHT) {
        computedPages.push(currentPage);
        currentPage = [item];
        currentHeight = blockHeight;
      } else {
        currentPage.push(item);
        currentHeight += blockHeight;
      }
    });

    if (currentPage.length > 0) {
      computedPages.push(currentPage);
    }
    setPages(computedPages);
  }, [announcement, measureRef]);

  const facebookText = useMemo(() => buildFacebookText(announcement), [announcement]);
  const checklistRows = useMemo(() => buildChecklistRows(announcement), [announcement]);

  return (
    <section className="announcement" data-announcement={announcement.id}>
      <header className="announcement-header">
        <div>
          <h2>{announcement.agencyName}</h2>
          <p>ประกาศระบบบริจาคแบบหลายรายการ พร้อม Smart Pagination</p>
        </div>
        <div className="announcement-actions">
          <button type="button" onClick={onExport}>
            Export Poster PDF/JPG
          </button>
          <button type="button" onClick={onChecklist}>
            Export Checklist PDF
          </button>
        </div>
      </header>
      <div className="announcement-body">
        <div className="poster-preview">
          {pages.map((pageItems, pageIndex) => (
            <div className="page" key={`${announcement.id}-page-${pageIndex}`}>
              <div className="page-header">
                <div className="logo">
                  {announcement.logoUrl ? (
                    <img src={announcement.logoUrl} alt="logo" />
                  ) : (
                    <div className="logo-placeholder">LOGO</div>
                  )}
                  <div>
                    <div className="agency-name">{announcement.agencyName}</div>
                    <div className="title">{announcement.title}</div>
                  </div>
                </div>
                {pageIndex === 0 && (
                  <div className="date-badge">วันที่ {announcement.date}</div>
                )}
              </div>
              <div className="page-content">
                <div className="page-title">ประกาศขอรับบริจาค</div>
                {pageItems.map((item, idx) => (
                  <div
                    className={`content-block ${item.continuation ? "continuation" : ""}`}
                    key={`${item.name}-${idx}`}
                  >
                    <div className="content-image">
                      <img src={item.resolvedImage} alt={item.name} />
                    </div>
                    <div className="content-text">
                      <span className="category-badge">{item.category}</span>
                      <h3>{item.name}</h3>
                      <div className="description">{item.description}</div>
                      <div className="quantity">จำนวนที่ต้องการ: {item.quantity}</div>
                      {item.continuation && (
                        <div className="continuation-note">ต่อเนื่องจากหน้าก่อน</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="page-footer">
                <div className="contact">{announcement.contact}</div>
                <div className="qr">
                  {announcement.qrUrl ? (
                    <img src={announcement.qrUrl} alt="qr" />
                  ) : (
                    <div className="qr-placeholder">QR CODE</div>
                  )}
                </div>
              </div>
              <div className="page-divider" />
            </div>
          ))}
        </div>
        <div className="outputs">
          <div className="output-card">
            <h3>ข้อความประชาสัมพันธ์ Facebook</h3>
            <textarea readOnly value={facebookText} />
          </div>
          <div className="output-card" data-checklist-id={announcement.id}>
            <h3>Print Checklist</h3>
            <div className="checklist">
              <div className="checklist-header">
                <div>
                  <div className="checklist-title">ตารางตรวจรับสิ่งของ</div>
                  <div className="checklist-subtitle">{announcement.agencyName}</div>
                </div>
                <div className="checklist-date">วันที่ {announcement.date}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>ลำดับ</th>
                    <th>หมวดหมู่</th>
                    <th>รายการ</th>
                    <th>จำนวน</th>
                    <th>รับจริง</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {checklistRows.map((row) => (
                    <tr key={row.no}>
                      <td>{row.no}</td>
                      <td>{row.category}</td>
                      <td>{row.name}</td>
                      <td>{row.quantity}</td>
                      <td>{row.received}</td>
                      <td>{row.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="checklist-footer">ผู้ตรวจรับ: ______________________</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default App;
