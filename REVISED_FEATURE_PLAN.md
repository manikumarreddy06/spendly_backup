# Spendly — Revised Feature Plan (Utility-First)

## Why This Revision

The previous plan focused on engagement tricks (streaks, notifications) and monetization (interstitials, affiliate). But the deeper analysis revealed the app has **fundamental utility gaps** that prevent it from being genuinely useful daily. No amount of streaks or notifications fixes an app that can't answer "how much money do I actually have?"

This revised plan prioritizes **real utility** — features that solve genuine user problems and make the app indispensable.

---

## The Core Problem

Spendly is a **one-sided ledger**. It tracks money going out but never money coming in. The "Total Balance" on the home screen is just `salary - expenses` — a budget-remaining calculation, not a real balance. The onboarding screen promises "achieve goals" but no goal feature exists. Recurring bills exist but there's no calendar or due-date reminders.

A user opens a finance app to answer one question: **"How much money do I have?"** Spendly can't answer that.

---

## Phase 1: Make It a Real Finance Tool

### Feature 1: Income Tracking
**Problem:** The app only tracks expenses. Users can't log salary deposits, freelance payments, refunds, or cash gifts. The `Expense` interface has no `type` field — every entry is implicitly a debit.

**What to build:**
- Add `type: "income" | "expense"` field to the `Expense` interface (default "expense" for backward compatibility)
- Add income categories: Salary, Freelance, Investment Returns, Gifts, Refunds, Other Income
- Add an "Add Income" flow (similar to quick-log but for income — green theme instead of red)
- Show income entries in history with green/positive styling
- Income entries reduce the month's net spending

**Why it matters:** Without income tracking, the app can never show true financial picture. Freelancers and gig workers (a huge Indian demographic) can't use the app meaningfully with just a static salary field.

**Files:**
- `context/AppContext.tsx` — add `type` field to `Expense` interface
- `context/state/useExpenseState.ts` — support income entries
- `constants/categories.ts` — add income categories
- `app/quick-log.tsx` — add income/expense toggle
- `app/(tabs)/history.tsx` — show income with green styling

---

### Feature 2: Net Cash Flow View
**Problem:** The home screen's BalanceCard shows "Total Balance" which is really `salary - expenses`. There's no income vs. spending comparison, no actual cash flow, no carry-over between months.

**What to build:**
- Replace the budget-remaining card with a net cash flow card:
  - "Income: ₹50,000 | Spent: ₹32,000 | Net: +₹18,000"
- Show this month's actual income (from income transactions) vs actual spending
- If no income logged, fall back to salary as estimated income
- Add month-over-month net cash flow trend (are you saving more or less?)

**Why it matters:** Users open finance apps to see their real financial position. "Budget remaining" is a planning concept; "net cash flow" is reality.

**Files:**
- `components/BalanceCard.tsx` — redesign to show income/spent/net
- `app/(tabs)/index.tsx` — pass income data to card
- `context/AppContext.tsx` — expose `getCurrentMonthIncome()`

---

### Feature 3: Savings Goals
**Problem:** The onboarding screen promises "Set budgets, achieve goals and stay in control of your money" but no goal feature exists anywhere. The app only shows spending, never saving.

**What to build:**
- Create named savings goals: "Emergency Fund: ₹1,00,000", "Vacation: ₹30,000", "New Phone: ₹25,000"
- Set target amount and optional target date
- Visual progress bar showing % complete
- Auto-calculate: "Save ₹X/month to reach this goal by [date]"
- Show goal progress on home screen (compact card) and a dedicated goals screen
- Optional: auto-allocate monthly contribution (visual only — shows how much of net cash flow should go to each goal)

**Why it matters:** Goals give users a reason to check the app — "Am I on track for my vacation fund?" This is positive reinforcement, not just "how much did I spend."

**Files:**
- `context/state/useSavingsGoalState.ts` (NEW) — goal CRUD
- `context/AppContext.tsx` — expose goals
- `app/savings-goals.tsx` (NEW) — goals management screen
- `app/(tabs)/index.tsx` — compact goal progress card
- `components/SavingsGoalCard.tsx` (NEW) — goal progress component

---

## Phase 2: Reduce Daily Friction

### Feature 4: Bill Calendar + Due Date Reminders
**Problem:** The recurring bills screen is a flat list. There's no calendar view, no monthly total of fixed obligations, and no push notifications before bills are due. The app already computes `getNextBillingDate()` but never uses it for reminders.

**What to build:**
- Calendar view showing upcoming bills on their due dates (monthly grid)
- "Total bills due this month: ₹4,200" summary at top
- Push notification 1-2 days before each bill is due: "Your Netflix subscription (₹649) is due tomorrow"
- Tapping the notification opens the recurring bills screen
- Color-code bills by urgency (red = due soon, green = paid/upcoming)

**Why it matters:** Missing a bill payment has real consequences (late fees, service cutoff). This is the single most impactful notification feature — it protects the user's money.

**Files:**
- `app/recurring-bills.tsx` — add calendar view toggle
- `hooks/useNotifications.ts` — schedule bill due reminders
- `context/state/useExpenseState.ts` — expose upcoming bills calculation
- `lib/billCalendar.ts` (NEW) — calendar data generation

---

### Feature 5: Smart Contextual Notifications
**Problem:** Current notifications are static and non-contextual. The expense reminder always says "Don't forget to record what you spent" even if the user already logged expenses that day. The review reminder fires unconditionally even when there are no pending transactions.

**What to build:**
- **Contextual expense reminders**: "You haven't logged any expenses today" vs "You've logged 3 expenses today. Great consistency! 💪"
- **Conditional review reminders**: Only fire when `pendingTransactionCount > 0`, include count in body: "3 transactions waiting for review"
- **Weekly spending summary** (Sunday 8 PM): "This week: ₹3,200 spent. 15% less than last week 🎉"
- **Proactive budget warnings**: "You've used 90% of your Food budget with 10 days left"
- **Auto-approval notification**: "3 transactions auto-categorized and logged — tap to review"

**Why it matters:** Relevant notifications have 3x higher open rates. Irrelevant notifications cause users to disable all notifications (or uninstall).

**Files:**
- `hooks/useNotifications.ts` — contextual notification bodies, conditional scheduling
- `lib/notificationContent.ts` (NEW) — dynamic notification text generation
- `context/AppContext.tsx` — expose today's expense count, weekly summary

---

### Feature 6: Daily Streak (Lightweight)
**Problem:** No reason to open the app daily beyond logging expenses.

**What to build:**
- Track consecutive days with at least one logged expense
- Small flame icon + count in the home screen header (not a big deal, just a subtle indicator)
- Weekly notification: "🔥 12-day logging streak! Keep it up."
- No penalties for breaking streaks — purely positive reinforcement
- Milestone badges: 7 days, 30 days, 100 days (shown in profile)

**Why it matters:** Streaks are proven to drive daily engagement. But keep it lightweight — it's a nice-to-have, not the core value.

**Files:**
- `lib/streaks.ts` (NEW) — streak tracking
- `app/(tabs)/index.tsx` — streak indicator in header
- `hooks/useNotifications.ts` — weekly streak notification

---

## Phase 3: Remove Logging Friction

### Feature 7: Android Home Screen Widget
**Problem:** The #1 friction point is logging expenses at point of purchase. Users must: open app → navigate → tap FAB → enter amount → save. A widget removes this barrier.

**What to build:**
- Android home screen widget (2x2) showing:
  - Remaining budget for the month
  - Quick-add button (opens quick-log directly)
  - Today's spending total
- Tap any element to open the app
- Updates daily via scheduled background task

**Why it matters:** This is the feature that makes an expense tracker a daily habit. Users see their budget every time they look at their phone, and can log an expense in 2 taps from the home screen.

**Files:**
- `android/app/src/main/java/com/spendlyapp/personal/SpendlyWidgetProvider.kt` (NEW)
- `android/app/src/main/res/layout/widget_layout.xml` (NEW)
- `android/app/src/main/AndroidManifest.xml` — register widget receiver
- `android/app/src/main/res/xml/app_widget_info.xml` (NEW)

---

## Phase 4: Monetization (Non-Intrusive Only)

### Revenue Stream 1: Rewarded Ads (Opt-In Only)
**What:** User *chooses* to watch a 30-second ad to earn 24 hours ad-free.

**Why:** Zero friction — user opts in. Higher CPM than interstitials ($10-20 vs $3) because users actually watch. No interruption to core flow.

**Files:**
- `lib/ads.ts` — add rewarded ad support
- `app/profile.tsx` — "Watch ad for 24h ad-free" button

### Revenue Stream 2: Affiliate Offers (Opt-In Discover Tab)
**What:** A "Discover" section showing financial products relevant to spending patterns.

**Why:** ₹1,500-3,500 per credit card approval. User chooses to engage. No sensitive data shared — only category-level patterns inform which offers to show.

**How:**
- High travel spend → travel credit card offer
- High food delivery → cashback credit card
- Spending exceeds income → personal loan offer
- Has savings → investment platform

**Files:**
- `lib/offers.ts` (NEW) — offer management
- `constants/financialOffers.ts` (NEW) — offer catalog
- `app/discover.tsx` (NEW) — offers screen
- `app/(tabs)/profile-tab.tsx` — add Discover link

### Revenue Stream 3: Fix Ad-Free Toggle
**What:** Convert the free Ad-Free toggle to reward-based:
- Earn ad-free days through streaks (7-day streak = 1 day ad-free)
- Or watch a rewarded ad for 24h ad-free
- Or rate the app for 7 days ad-free

**Why:** The current free toggle kills ad revenue. This keeps users engaged while protecting revenue.

---

## What I'm NOT Building (And Why)

| Feature | Why Not |
|---------|---------|
| Interstitial ads | Interrupts core flow, causes uninstalls in utility apps |
| Premium subscription | User explicitly said not now |
| Receipt photo capture | Nice but not daily-use critical; high effort |
| Multi-account/wallet | Adds complexity; most users just want "money in vs out" |
| Debt/loan tracking | Important but less frequently accessed; Phase 5+ |
| Voice logging | Cool but unreliable; typing is faster for amounts |

---

## Implementation Priority

| Phase | Feature | Impact | Why |
|-------|---------|--------|-----|
| **1** | Income Tracking | Critical | App can't be a real finance tool without it |
| **1** | Net Cash Flow View | Critical | Users need to see real financial position |
| **1** | Savings Goals | High | Onboarding promises it; gives positive reinforcement |
| **2** | Bill Calendar + Reminders | High | Protects user's money; genuinely useful notifications |
| **2** | Smart Contextual Notifications | High | Fixes notification fatigue; 3x open rates |
| **2** | Daily Streak | Medium | Lightweight engagement driver |
| **3** | Android Widget | High | Removes #1 friction point for daily use |
| **4** | Rewarded Ads | Medium | Non-intrusive monetization |
| **4** | Affiliate Offers | High | ₹1,500+ per conversion |
| **4** | Fix Ad-Free Toggle | Medium | Protects existing ad revenue |

---

## The Philosophy

**Utility first, engagement second, monetization third.**

An expense tracker that can't track income or show real balance is a toy. Fix the fundamentals first — make the app genuinely useful — and daily engagement + monetization follow naturally from a product people actually need.

The previous plan tried to add engagement layers (streaks, notifications) on top of an incomplete product. This plan fixes the product first.
