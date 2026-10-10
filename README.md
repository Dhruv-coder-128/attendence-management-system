# Ruparel Tuition & Academy Management ERP

A premium enterprise Tuition Management ERP designed specifically for coaching academies and tuition centers with 400–500 students.

## 🛠 Technology Stack

- **Frontend**: React 19 + Vite 8 + Plain JavaScript (JSX)
- **Styling**: Vanilla CSS Design System (Refined Corporate Navy `#0A1424`, Off-White `#F4F6F9`, Muted Gold `#C5A880`)
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL)
- **Hosting & Serverless Functions**: [Vercel](https://vercel.com)
- **Communications**: Telegram Bot API for automated parent notifications
- **Icons**: Lucide React

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) or [http://localhost:5174](http://localhost:5174) in your browser.

### 3. Production Build Validation
```bash
npm run build
```

---

## 📂 Project Architecture

```
attendence-management-system/
├── .env.example               # Environment variables template
├── index.html                 # App shell with typography and metadata
├── vite.config.js             # Vite configuration
├── package.json               # Dependencies and scripts
└── src/
    ├── lib/
    │   └── supabase.js        # Safe Supabase client initialization (zero secret exposure)
    ├── data/
    │   └── demoData.js        # Realistic 472-student academy dataset for preview
    ├── components/
    │   ├── common/
    │   │   ├── Button.jsx     # Enterprise button (primary navy, gold, outline, danger)
    │   │   ├── Badge.jsx      # Multi-state badge (Present, Absent, Late, Excused, Fee)
    │   │   ├── DataTable.jsx  # Paginated data table with real-time search
    │   │   ├── Modal.jsx      # Accessible modal dialog
    │   │   ├── Input.jsx      # Clean form text/number inputs
    │   │   ├── Select.jsx     # Clean form dropdowns
    │   │   └── StatsCard.jsx  # Metric cards with tabular numbers
    │   └── layout/
    │       ├── Sidebar.jsx    # Fixed corporate navy sidebar with module navigation
    │       ├── TopNav.jsx     # Topbar with breadcrumbs, date, quick actions & alerts
    │       └── AppLayout.jsx  # Main application container
    ├── pages/
    │   ├── LoginPage.jsx        # Professional ERP authentication screen with demo fill
    │   ├── DashboardPage.jsx    # Executive overview (472/500 capacity, roll call KPIs)
    │   ├── StudentsPage.jsx     # 472-student directory with grade/fee filters & dossiers
    │   ├── BatchesPage.jsx      # 16-batch academic schedules & hall allocations
    │   ├── AttendancePage.jsx   # Live roll call register with interactive status toggles
    │   ├── ParentsPage.jsx      # Guardian directory & notification channel preferences
    │   ├── NotificationsPage.jsx# Telegram Bot & SMS outbox and message composer
    │   └── SettingsPage.jsx     # Academy profile, thresholds & Supabase/Telegram status
    ├── index.css              # Enterprise design system tokens and styling
    ├── App.jsx                # Root router, active page switching, and state manager
    └── main.jsx               # Application entry point
```

---

## 🔌 Connecting Backend Services

### 1. Supabase (PostgreSQL & Authentication)
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Populate your Supabase project credentials in `.env.local`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
   ```
3. The client in `src/lib/supabase.js` will automatically detect the configuration.

### 2. Telegram Bot API
1. Message `@BotFather` on Telegram to create a bot and obtain `TELEGRAM_BOT_TOKEN`.
2. Add your bot token and chat target into `.env` (kept server-side on Vercel API routes to protect credentials).
