# Spendly App Documentation

## Overview
Spendly is a React Native/Expo application for personal and group expense tracking with features similar to Splitwise, enhanced with budgeting and custom categorization capabilities.

## Tech Stack
- **Framework**: React Native with Expo
- **Language**: TypeScript
- **State Management**: React Context API + React Query
- **Backend**: Supabase (PostgreSQL + Auth)
- **Storage**: AsyncStorage for local caching
- **Navigation**: Expo Router (file-based routing)

## Key Features

### 1. Authentication System
- Email/password auth via Supabase
- Session persistence with token refresh
- OAuth deep linking handling (implicit flow & PKCE)
- Automatic redirect based on auth state:
  - No session → Welcome screen
  - Session but no profile → Onboarding
  - Complete profile → Main tabs interface

### 2. Expense Tracking
- **Personal Expenses**: Individual spending records
  - Category-based (travel, food, shopping, etc.)
  - Amount, description, date tracking
  - Budget limits per category
- **Shared Expenses**: Group splitting functionality
  - Split modes: Equal, Percentage, Custom
  - Settlement tracking
  - Debt simplification algorithm

### 3. Group Management
- Create/split groups with custom naming (emoji/color tags)
- Add/remove members (with balance validation)
- Join groups via invite links
- Group-level expense history and settlements

### 4. Budgeting & Analytics
- Monthly budget limits per category
- Spending tracking vs. budgets
- Category-based spending insights
- "Owe Summary" showing what others owe you vs. what you owe

### 5. Customization
- Custom expense categories with colors/icons
- Group visual customization (emoji + color)
- Currency support (defaults to ₹)

## Data Flow & Storage

### Local Storage (AsyncStorage)
- User profile
- Expenses cache
- Split groups cache
- Budget limits
- Custom categories
- Cached user ID (for cache isolation)

### Remote Storage (Supabase Tables)
- `user_profiles`: Name, salary, currency
- `expenses`: Personal expenses (with user_id RLS)
- `groups`: Split groups with members
- `settlements`: Shared expense records
- `user_settings`: Budget limits & custom categories (synced)

## Core Business Logic

### Expense Splitting Algorithms
- **Equal**: Total ÷ member count
- **Percentage**: Based on customShares (must total 100%)
- **Custom**: Exact amounts per member (must total expense amount)

### Debt Simplification
- Calculates net balances per member
- Separates creditors (positive) and debtors (negative)
- Optimizes transactions to minimize payments
- Example: A owes B ₹100 + B owes A ₹50 → A pays B ₹50

### Validation & Safety
- Custom share validation (sums must match total/100%)
- Member resolution with whitespace/case normalization
- Settlement validation (prevents zero-amount settlements)
- User ID filtering for Supabase queries (RLS compliance)

## Screen Flow

1. **Auth Flow**: Welcome → Login/Signup
2. **Onboarding**: Profile setup (name, salary, currency)
3. **Main Interface** (Tab-based):
   - **Home**: Quick add expense + recent activity
   - **History**: Chronological expense list
   - **Insights**: Budget tracking & category breakdown
   - **Split**: Group expenses & settlements
4. **Secondary Screens**:
   - Profile: View/edit personal info
   - Settings: App preferences
   - Add Expense: Personal/shared expense entry
   - Add Category: Custom category creation

## Technical Implementation Details

### Supabase Integration
- Proper RLS with user_id filtering on expenses
- Upsert patterns for offline-first sync
- Realistic error handling with fallback to local storage
- Session management via auth state listeners

### Performance Optimizations
- React Query for data fetching/caching
- Memoized computed properties (allExpenses, budgets)
- Efficient group filtering (user isolation)
- Selective state updates to minimize re-renders

### Error Handling
- Graceful degradation to local storage on Supabase failures
- Comprehensive try/catch blocks with logging
- User-friendly error states via ErrorBoundary

## Component Architecture

### Context
- **AppContext**: Global state management
- **useApp**: Context consumer hook
- **useColors**: Theme hook

### Components
- **ErrorBoundary**: Global error catching
- **KeyboardAwareScrollViewCompat**: UI polish component
- Custom UI elements throughout

### Utilities
- **genId()**: UUID v4 generation
- **parseGroupName/formatGroupName**: Visual customization helpers
- **useCurrency**: Currency helper hook

## Data Synchronization Strategy

1. **Load Priority**: Local cache → Supabase (with user validation)
2. **Write Pattern**: Optimistic UI update → Local storage → Supabase
3. **Conflict Resolution**: Last-write-wins with timestamps
4. **Cache Invalidation**: User ID changes trigger cache purge
5. **Background Sync**: Auth state changes trigger refresh

## Important Files & Directories

- `app/_layout.tsx`: Root layout with auth routing logic
- `app/index.tsx`: Auth redirect logic (welcome/onboarding/tabs)
- `context/AppContext.tsx`: Main state management (800+ lines)
- `lib/split.ts`: Expense splitting calculations
- `lib/supabase.ts`: Supabase client initialization
- `hooks/useColors.ts`: Theme color management
- `components/`: Reusable UI components
- `app/(tabs)/`: Main tab navigation screens

## Key Functions in AppContext

### Authentication
- `hasSession`: Boolean tracking auth state
- `sessionLoaded`: Profile data loading state

### Profile Management
- `profile`: UserProfile object (name, salary, currency)
- `setProfile`: Update user profile

### Personal Expenses
- `expenses`: Array of personal expenses
- `addExpense`: Add new expense
- `deleteExpense`: Remove expense
- `getCurrentMonthExpenses`: Filter current month expenses
- `getCurrentMonthTotal`: Sum of current month spending
- `getTotalByCategory`: Spending by category
- `getSpentByCategory`: Alias for getTotalByCategory

### Shared Expenses/Groups
- `splitGroups`: Array of split groups
- `createSplitGroup`: Create new group
- `deleteSplitGroup`: Remove group
- `addSplitExpense`: Add expense to group
- `deleteSplitExpense`: Remove expense from group
- `settleUp`: Settle specific expense between members
- `settleAllDebtsBetween`: Settle all debts between two members
- `addGroupMember`: Add member to group
- `removeGroupMember`: Remove member from group (with balance check)
- `getBalances`: Calculate member balances in group
- `getSimplifiedBalances`: Optimized debt settlement
- `getOweSummary`: Total owed/owe across all groups
- `joinGroupFromInvite`: Join group via invite ID

### Budgeting
- `budgetLimits`: Category → limit mapping
- `setBudgetLimit`: Set budget for category
- `getCategoryBudgetPct`: Percentage of budget used

### Custom Categories
- `customCategories`: Array of custom categories
- `addCustomCategory`: Add new custom category
- `deleteCustomCategory`: Remove custom category

## Data Models

### Expense (Personal)
```typescript
{
  id: string,
  category: string, // ExpenseCategory | string
  amount: number,
  description: string,
  date: string, // ISO date
  createdAt: string // ISO timestamp
}
```

### SplitExpense (Group)
```typescript
{
  id: string,
  description: string,
  totalAmount: number,
  paidBy: string, // member name
  splitAmong: string[], // member names
  customShares?: Record<string, number>, // for percentage/custom splits
  settled: string[], // members who have settled
  date: string,
  splitMode: "equal" | "percentage" | "custom",
  category?: string
}
```

### SplitGroup
```typescript
{
  id: string,
  name: string,
  members: string[],
  expenses: SplitExpense[],
  createdAt: string,
  createdBy?: string // user ID
}
```

### UserProfile
```typescript
{
  name: string,
  salary: number,
  currency: string
}
```

### CustomCategory
```typescript
{
  id: string,
  name: string,
  color: string,
  icon: string
}
```

## Environment Variables
The app expects Supabase credentials in `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Development Notes
- Uses Expo Router for file-based navigation
- Implements optimistic UI updates for better UX
- Has robust error boundaries to prevent app crashes
- Supports deep linking for OAuth flows
- Includes offline-first capabilities with local storage sync
- Follows React Native best practices for performance

## How to Use This Documentation
This CLAUDE.md file serves as a reference for understanding the Spendly application architecture and functionality. When returning to work on this app, you can refer to this document instead of having the app re-explained from scratch.

Last updated: 2026-05-26