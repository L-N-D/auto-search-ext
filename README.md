# 🚀 AI Quiz & Question Solver - Chrome Extension (Alt + R)

Extension trình duyệt hỗ trợ tự động chụp màn hình browser khi bấm tổ hợp phím **Alt + R**, gửi ảnh tới mô hình thị giác **Google Gemini AI**, nhận diện câu hỏi & các phương án, và hiển thị ngay đáp án chính xác nhất lên một cửa sổ nổi (Floating HUD) hiện đại, kéo thả được trực tiếp trên trang.

---

## ✨ Tính năng nổi bật

- ⌨️ **Kích hoạt tức thì với phím tắt:** Bấm **`Alt + R`** trên bất kỳ website nào để tự động chụp và phân tích câu hỏi đang hiển thị.
- 🧠 **Cơ chế Dual-Rotation (Xoay vòng Model + Xoay vòng Key):**
  - Tự động luân phiên xoay vòng qua **5 mô hình Flash tốt nhất**: `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-3-flash-preview`, `gemini-3.5-flash`, và `gemini-3.8-flash`.
  - Kết hợp xoay vòng qua **19 Gemini API Keys**.
  - **Tự động cứu nguy khi gặp Rate Limit (429 / Quota Exceeded):** Nếu một model hoặc một key bị giới hạn hạn mức, extension sẽ lập tức thử tiếp với model và key kế tiếp trong tích tắc, hoàn toàn không bao giờ bị nghẽn!
  - Tích hợp bộ System Prompt tối ưu chuyên sâu cho môn **Lịch sử Đảng Cộng sản Việt Nam** (bẻ gãy bẫy phủ định, mốc thời gian, hội nghị, đại hội, chỉ thị và nhân vật lịch sử).
- 📋 **Hỗ trợ nhiều câu hỏi trong 1 ảnh chụp:**
  - Tự động quét và giải **tất cả** các câu hỏi xuất hiện trên màn hình cùng lúc.
  - Hiển thị rõ ràng số thứ tự hoặc tên câu hỏi (ví dụ: `📌 Câu 1`, `📌 Câu 2`, `📌 Question 3`...).
- 🛡️ **Lọc thông minh - Không đoán bừa khi thiếu đáp án:**
  - **Chỉ trả lời** các câu hỏi hiển thị **đầy đủ** các phương án lựa chọn và xác định được đáp án đúng.
  - **Tự động bỏ qua** các câu bị thiếu đáp án do cuộn dở, bị cắt khuất mép màn hình hoặc các câu không thấy đáp án đúng trong danh sách nhìn thấy được.
  - Liệt kê danh sách các câu đã bỏ qua kèm lý do cụ thể (ví dụ: *Bị che khuất phương án C, D do mép màn hình*).
- 🎯 **Trích xuất thông minh:**
  - Nhận diện câu hỏi & các phương án lựa chọn (A, B, C, D...).
  - Highlight nổi bật **Đáp án đúng nhất** kèm tỷ lệ tự tin (% confidence).
  - Có phần giải thích chi tiết, súc tích lý do tại sao đáp án đó đúng.
- 🪟 **Floating HUD (Cửa sổ nổi hiện đại):**
  - Giao diện Dark Glassmorphism cao cấp, hiệu ứng ánh sáng gradient.
  - Kéo thả (drag & drop) tới bất kỳ vị trí nào trên màn hình.
  - Nút **Sao chép tất cả đáp án** ở thanh dưới, cùng nút **Chép riêng từng câu** ở góc mỗi câu hỏi.
  - Nút **Thu nhỏ**, **Đóng** (`Esc`), nút **Chụp lại** (🔄).
  - Độc lập hoàn toàn qua Shadow DOM, không bị vỡ giao diện bởi CSS trang web gốc.
- 🔒 **Bảo mật & Quản lý linh hoạt:** Quản lý danh sách API keys qua giao diện popup, có thể dán thêm hoặc bấm nút "↺ Nạp lại 19 key" bất kỳ lúc nào.

---

## 🛠️ Hướng dẫn cài đặt Extension vào Chrome

### Bước 1: Chuẩn bị thư mục mã nguồn
Thư mục dự án hiện tại là: `f:\Projects\tool`

### Bước 2: Tải extension lên Google Chrome
1. Mở trình duyệt Chrome, gõ vào thanh địa chỉ:
   ```text
   chrome://extensions/
   ```
2. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
3. Bấm vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
4. Chọn thư mục dự án `f:\Projects\tool` (nơi chứa file `manifest.json`).
5. Tiện ích **AI Quiz & Question Solver (Alt+Z)** sẽ xuất hiện trên danh sách extension của bạn! Hãy ghim (Pin) extension lên thanh công cụ để tiện theo dõi.

---

## 🔑 Hướng dẫn lấy Gemini API Key (Hoàn toàn miễn phí)

1. Truy cập vào **[Google AI Studio](https://aistudio.google.com/app/apikey)** và đăng nhập tài khoản Google.
2. Bấm vào nút **Create API key** (Tạo API key mới).
3. Copy đoạn mã API key (dạng `AIzaSy...`).
4. Bấm vào biểu tượng extension trên thanh công cụ của trình duyệt, dán API key vào ô **Gemini API Key** rồi bấm **Lưu cài đặt**.
5. Bấm nút **Kiểm tra kết nối** để kiểm tra key hoạt động chuẩn xác!

---

## 🎮 Cách sử dụng

1. Mở bất kỳ trang web nào chứa câu hỏi hoặc đề trắc nghiệm.
2. Nhấn tổ hợp phím **`Alt + R`** (hoặc mở popup bấm **"Chụp màn hình & Giải ngay"**).
3. Cửa sổ nổi sẽ hiện lên góc màn hình:
   - Trạng thái 1: *Đang chụp màn hình hiện tại...*
   - Trạng thái 2: *Đang gửi ảnh tới Google Gemini AI...*
   - Trạng thái 3: *Hiển thị câu hỏi, danh sách đáp án, đáp án đúng nhất được highlight màu xanh ngọc neon và lời giải thích!*
4. Bấm nút **📋 Sao chép** để copy nhanh nội dung đáp án vào clipboard.
5. Kéo thả thanh tiêu đề nếu muốn di chuyển cửa sổ sang vị trí khác.
6. Bấm phím **`Esc`** hoặc nút `✕` để đóng cửa sổ.

---

## ⚙️ Đổi phím tắt mặc định (Nếu muốn)

Nếu phím `Alt + R` bị trùng với ứng dụng khác:
1. Truy cập: `chrome://extensions/shortcuts`
2. Tìm tiện ích **AI Quiz & Question Solver**.
3. Bấm vào biểu tượng bút chì để đặt lại tổ hợp phím bạn muốn (ví dụ: `Ctrl + Shift + S`, `Alt + Q`, v.v.).

---

## 📁 Cấu trúc thư mục

```text
f:\Projects\tool\
├── manifest.json         # Khai báo extension Manifest V3, permissions & commands
├── background.js        # Service Worker xử lý phím tắt Alt+R, chụp tab & gọi Gemini Vision API
├── content.js           # Content Script tạo và quản lý Floating HUD draggable trên trang web
├── content.css          # CSS Glassmorphism giao diện tối cô lập trong Shadow DOM
├── popup/
│   ├── popup.html       # Giao diện cài đặt API Key, chọn model & nút kích hoạt nhanh
│   ├── popup.css        # Giao diện Dark theme cho popup
│   └── popup.js         # Xử lý lưu storage & kiểm tra kết nối API Key
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
