# 🇮🇷 Antigravity Persian RTL & Font Plugin
افزونه فارسی‌ساز، فونت وزیرمتن و راست‌چین برای برنامه **Google Antigravity**

Adds high-quality Persian typography (**Vazirmatn font**) and automatic **RTL (Right-to-Left)** text direction to the Google Antigravity application.

---

## ✨ Features / قابلیت‌ها

- 🔤 **فونت زیبای وزیرمتن (Vazirmatn Font):** اعمال خودکار فونت استاندارد و خوانای وزیرمتن در تمامی بخش‌های برنامه.
- ↔️ **راست‌چین خودکار هنگام تایپ:** با شروع به تایپ متن فارسی، کادر ورودی به صورت آنی به حالت راست‌چین تغییر جهت می‌دهد.
- 💬 **پشتیبانی کامل از پیام‌های چت:** تشخیص خودکار پیام‌ها و پاسخ‌های فارسی مدل با `MutationObserver` و اعمال فوری RTL.
- 💻 **حفظ جهت کدهای برنامه‌نویسی:** بلاک‌های کد (`pre`, `code`) و ترمینال همیشه چپ‌چین (LTR) و با فونت مونو باقی می‌مانند.
- 📋 **تنظیم لیست‌ها و جداول:** نقطه‌گذاری و شماره‌گذاری لیست‌ها و جداول متناسب با زبان فارسی در سمت راست قرار می‌گیرند.
- ⚡ **کاملاً خودکار:** نیاز به باز نگه داشتن پنل ندارد؛ به صورت خودکار در پس‌زمینه اجرا می‌شود.

---

## 🚀 Easy Installation / نصب آسان

Users can install this plugin with a single command in their terminal:

### Windows (PowerShell)
کافیست دستور زیر را در PowerShell اجرا کنید:

```powershell
git clone https://github.com/majidkarimi/antigravity-persian-rtl.git "$env:USERPROFILE\.gemini\config\plugins\persian-rtl"
```

### macOS / Linux (Terminal)
در ترمینال سیستم‌عامل مک یا لینوکس:

```bash
git clone https://github.com/majidkarimi/antigravity-persian-rtl.git "$HOME/.gemini/config/plugins/persian-rtl"
```

---

## ⚙️ How to Activate / فعال‌سازی در برنامه

1. برنامه **Antigravity** را باز کنید (یا یک بار ببندید و دوباره باز کنید).
2. از منوی سمت چپ به بخش **Customizations** بروید.
3. تب **Installed** را انتخاب کنید.
4. افزونه **Persian RTL** را پیدا کرده و آن را **Enable** کنید.

تمام! از این لحظه فونت وزیرمتن و راست‌چین در کل برنامه فعال خواهد بود.

---

## 🛠 Manual Installation / نصب دستی

If you downloaded the ZIP file:
1. Extract the folder and rename it to `persian-rtl`.
2. Move it to the Antigravity plugins directory:
   - **Windows:** `%USERPROFILE%\.gemini\config\plugins\persian-rtl`
   - **macOS / Linux:** `~/.gemini/config/plugins/persian-rtl`
3. Enable it from Antigravity settings (**Customizations** -> **Installed**).

---

## 📄 License
MIT License
