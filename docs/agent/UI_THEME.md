# UI_THEME.md - Visual Identity & UI Design Guide

This document defines the design patterns, visual guidelines, and UI direction for the **الأرشيف المدرسي العربي** (Arabic School Archive) web application, specifically optimized for Gulf school administration environments.

---

## 1. Core Visual Principles

- **Arabic-First & RTL-First**: The application layout must be designed from right-to-left. Text alignment, navigation sidebars, forms, and icons must naturally flow right-to-left.
- **Formal & Trustworthy Style**: This is an administrative school database, not a consumer SaaS or flashy startup website. The UI should project stability, order, and trust. 
- **Readability & High-Contrast**: Designed for administrative staff who view files and spreadsheets all day. Typography must be large, legible, and highly readable.
- **Micro-Animations**: Transitions between pages or during file uploads must be subtle (e.g. fading loaders, gradual progress indicators) and should not distract the user.

---

## 2. Typography

We use Google Fonts tailored for academic and official Gulf Arabic text structures.

- **Primary Font**: **Tajawal** (عائلة خط تاجول)
  - *Fallback*: System-UI, sans-serif
  - *Usage*: Headers, navigation, buttons, form labels. Tajawal has highly clear geometric structures, ideal for readability.
- **Secondary Font**: **Cairo** (عائلة خط القاهرة)
  - *Usage*: Body text, dashboard statistics, numerical grids.

### Font Configurations
```css
body {
  font-family: 'Tajawal', 'Cairo', sans-serif;
  direction: rtl;
  text-align: right;
}
```

---

## 3. Color Palette (Gulf Academic Palette)

Avoid high-saturation neon purples or flashy startup gradients. Use natural, calming, prestigious tones inspired by educational structures and Gulf environments (sand, slate, classic navy, olive).

| Tone Role | HSL Value | Description | Visual Impression |
|:---|:---|:---|:---|
| **Primary (Brand)** | `hsl(215, 60%, 23%)` | Deep Navy (أزرق داكن رسمي) | Authority, Trust |
| **Secondary** | `hsl(168, 38%, 32%)` | Soft Juniper/Sage (أخضر هادئ) | Safety, Academic Growth |
| **Accent / Action** | `hsl(38, 45%, 45%)` | Sand Gold (ذهبي رملي هادئ) | Elegance, Professionalism |
| **Background (Light)**| `hsl(210, 20%, 98%)` | Very Pale Blue/White (أبيض عاجي) | Cleanliness, Simplicity |
| **Card / Surface** | `hsl(0, 0%, 100%)` | Pure White | Clarity |
| **Border / Slate** | `hsl(210, 14%, 89%)` | Soft Gray (رمادي ناعم) | Definition, Borders |
| **Danger (Error)** | `hsl(0, 75%, 40%)` | Quiet Red (أحمر خافت) | Rejections, Warnings |

---

## 4. Layout & Components

- **Sidebar (Right-Aligned)**:
  - Fixed right-hand navigation containing clean icons and Arabic labels.
  - Collapses into a minimal icon view on smaller viewports.
- **Page Layout**:
  - Consistent header indicating the current school name (`اسم المدرسة`) and the authenticated user's name.
  - Large dashboard grid containing key stats (total archives, upload quota utilized, recent uploads).
- **Upload Dropzone Component**:
  - Styled with a soft dashed border matching the Secondary color (`hsl(168, 38%, 32%)`).
  - Illustrates clear Arabic instructions: `اسحب وأسقط الملفات هنا أو تصفح من جهازك` (Drag & drop files here or browse your device).
  - Explicit list of supported formats: `PDF, DOCX, XLSX, Images (Max 20MB)`.

---

## 5. Tone & Nomenclature

The terminology used across the UI must speak the language of school administrators in the Gulf region.
- Avoid English tech-slang (e.g. don't write "أبلود" - write `تحميل` or `أرشفة`).
- Do not use colloquial text; write in formal Modern Standard Arabic (الفصحى المبسطة).

| English Term | Preferred Arabic UI Term | Context |
|:---|:---|:---|
| Dashboard | لوحة التحكم | Main entry page |
| Archive | الأرشيف / المصنفات | Viewing archives |
| Upload File | أرشفة ملف جديد | Upload button |
| School Isolation | تصنيف المدرسة | tenant reference |
| Subscription Expired | انتهت صلاحية الاشتراك | Expiry message |
| Grace Period | فترة السماح | Countdown warnings |
