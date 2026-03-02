# UI Architecture & Design System
**WhatsApp Task Manager - Frontend Documentation**

---

## 📐 Design Philosophy

**Inspiration:** Superhuman, Linear, Notion  
**Core Principles:**
- Clean, minimal interface
- High information density
- Soft shadows and glassmorphism effects
- Fast scanning and navigation
- WhatsApp brand integration

---

## 🎨 Design System

### Color Palette

#### Light Mode
```css
/* Primary */
--whatsapp-green: #25D366
--primary-hover: #20B358

/* Backgrounds */
--bg-primary: #FFFFFF
--bg-secondary: #F9FAFB
--bg-surface: #F3F4F6
--bg-surface-soft: #F9FAFB

/* Text */
--text-primary: #111827
--text-secondary: #6B7280
--text-muted: #9CA3AF

/* Borders */
--border-light: #E5E7EB
--border-medium: #D1D5DB
```

#### Dark Mode
```css
/* Backgrounds */
--dark-bg-primary: #1F2937
--dark-bg-secondary: #111827
--dark-bg-surface: #374151

/* Text */
--dark-text-primary: #F9FAFB
--dark-text-secondary: #9CA3AF
--dark-text-muted: #6B7280

/* Borders */
--dark-border: #374151
```

#### Status Colors
```css
--success: #10B981
--warning: #F59E0B
--error: #EF4444
--info: #3B82F6
--purple: #8B5CF6
```

### Typography

**Font Family:** Inter, system-ui, sans-serif

**Scale:**
- Heading 1: 2rem (32px), font-weight: 700
- Heading 2: 1.5rem (24px), font-weight: 600
- Heading 3: 1.25rem (20px), font-weight: 600
- Body: 0.875rem (14px), font-weight: 400
- Small: 0.75rem (12px), font-weight: 400
- Tiny: 0.625rem (10px), font-weight: 500

**Line Heights:**
- Tight: 1.2 (for headings)
- Normal: 1.5 (for body text)
- Relaxed: 1.75 (for paragraphs)

### Spacing System

**Scale:** 4px base unit
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

### Shadows

```css
/* Soft shadows for cards */
--shadow-soft: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08);

/* Medium shadow for elevated elements */
--shadow-medium: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);

/* Large shadow for modals */
--shadow-large: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
```

### Border Radius

```css
--radius-sm: 6px
--radius-md: 8px
--radius-lg: 12px
--radius-xl: 16px
--radius-full: 9999px
```

---

## 🧩 Component Library

### 1. Cards

**Usage:** Container for related information

**Variants:**
- **Soft Card**: White background, subtle border, soft shadow
- **Elevated Card**: Slightly raised with medium shadow
- **Interactive Card**: Hover effect with pointer cursor

**Example:**
```css
.soft-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
  padding: 1rem;
}
```

### 2. Buttons

**Primary Button:**
- Background: WhatsApp green (#25D366)
- Text: White
- Hover: Slightly darker green
- Border radius: 8px
- Padding: 12px 24px

**Secondary Button:**
- Background: Transparent
- Border: 1px solid border-light
- Text: text-primary
- Hover: Light gray background

**Danger Button:**
- Background: Red (#EF4444)
- Text: White
- Used for destructive actions

### 3. Input Fields

**Text Input:**
```css
.input-field {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: var(--whatsapp-green);
  ring: 2px solid rgba(37, 211, 102, 0.2);
}
```

### 4. Badges/Pills

**Priority Badges:**
- Urgent: Red background, white text
- High: Orange background, white text
- Medium: Blue background, white text
- Low: Gray background, dark text

**Category Pills:**
- Work: Purple
- Study: Blue
- Personal: Green
- Ignore: Gray

**Style:**
```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### 5. Status Indicators

**Dot Indicators:**
- Connected: Green dot (10px diameter)
- Disconnected: Gray dot
- Error: Red dot
- Loading: Animated pulsing dot

### 6. Lists

**Dense List (Linear-style):**
- Row height: 48px
- Hover: Subtle background color change
- Border bottom: 1px light gray
- Padding: 12px 16px

**Features:**
- Custom checkbox (circular, 18px)
- Left-aligned content
- Right-aligned actions (visible on hover)
- Priority dot indicator (left side)

### 7. Modals

**Structure:**
```
Modal Overlay (backdrop-blur)
  └─ Modal Container (centered, shadow-large)
      ├─ Header (title, close button)
      ├─ Body (scrollable content)
      └─ Footer (action buttons)
```

**Dimensions:**
- Small: 400px width
- Medium: 600px width
- Large: 800px width

---

## 📱 Pages & Layouts

### Page Structure

All pages follow this structure:
```
Page Container (max-w-5xl, centered)
  ├─ Page Header
  │   ├─ Title (h1)
  │   ├─ Subtitle (text-muted)
  │   └─ Actions (buttons, filters)
  │
  └─ Page Content
      └─ Content sections
```

### 1. **Login Page** (`/login`)

**Layout:** Single column, centered

**Elements:**
- Logo image (top)
- Heading: "Log in to Mindline"
- Email input
- Password input
- Submit button: "Continue with email"
- Link to Register page

**Styling:**
- Max width: 400px
- Soft card container
- Whitespace-heavy
- Minimal distractions

---

### 2. **Register Page** (`/register`)

**Layout:** Single column, centered (matches Login)

**Elements:**
- Logo image
- Heading: "Create your account"
- Full Name input
- Email input
- Password input
- Confirm Password input
- Submit button: "Create account"
- Success state: Green checkmark + "Account created"
- Link to Login page

**Validation:**
- Real-time password matching
- Email format validation
- Required field indicators

---

### 3. **Dashboard** (`/dashboard`)

**Layout:** Grid-based responsive layout

**Sections:**

#### Top: Stats Grid (4 columns)
- Total Tasks
- Pending Tasks
- Completed Tasks
- Total Messages

**Card Design:**
- Soft shadow
- Icon (left side, colored circle)
- Number (large, bold)
- Label (small, muted)
- Trend indicator (optional)

#### Middle: Recent Tasks
- List of 5-10 recent tasks
- Each row: checkbox, title, priority badge, due date
- "View all" link at bottom

#### Bottom: Chart/Visualization (optional)
- Message classification breakdown
- Bar or pie chart

---

### 4. **Messages Page** (`/messages`)

**Layout:** Full-width list view

**Header:**
- Title: "Messages"
- Count badge (e.g., "247 messages")
- Search bar (right side)
- Filter dropdowns (Category, Priority, Decision)

**Sticky Controls Bar:**
- Stays at top when scrolling
- Contains filters and search

**Message List:**

Each row contains:
- Sender avatar (circular, 36px)
- Sender name (bold)
- Message preview (truncated, gray text)
- Timestamp (right side, small)
- Priority dot (left edge)
- Category pill (optional)

**Expanded State:**
When clicked, row expands to show:
- Full message content
- AI reasoning (in a light gray box)
- Classification details (category, priority, decision)
- Action buttons (Edit classification, Delete)

**Empty State:**
- Icon: Message icon
- Text: "No messages yet"
- Subtitle: "Connect WhatsApp to start receiving messages"

---

### 5. **Action Items Page** (`/action-items`)

**Layout:** List view similar to Messages

**Header:**
- Title: "Action Items"
- Count badge
- Filter: Priority (All, High, Medium, Low)

**Action Item Row:**
- Custom checkbox (circular)
- Task title (bold)
- Source message (small, link)
- Confidence score (subtle, e.g., "92% confidence")
- Priority badge
- Due date (if available)
- Actions: "Convert to Task" button (on hover)

**Modal: Edit Action Item**
When "Convert to Task" clicked:
- Modal opens
- Editable title field
- Category dropdown
- Priority dropdown
- Due date picker
- Notes textarea
- Buttons: "Create Task", "Cancel"

**Empty State:**
- Icon: CheckSquare
- Text: "No action items"
- Subtitle: "Action items will appear here as they're extracted from messages"

---

### 6. **Tasks Page** (`/tasks`)

**Layout:** Sectioned list view

**Sections:**
- Today (tasks due today)
- Upcoming (tasks due within 7 days)
- Later (tasks due more than 7 days out)
- No Due Date (backlog)

**Section Header:**
- Section name (uppercase, tracking-wide, small)
- Task count badge

**Task Row:**
- Custom circular checkbox (18px)
- Task title
- Priority badge (pill shape)
- Due date (if set)
- Actions dropdown (three dots, visible on hover)

**Checkbox Design:**
- Empty: Circle with gray border
- Checked: Filled green circle with white checkmark
- Hover: Border changes to green

**Filters (top):**
- Pill buttons: All, High, Medium, Low
- Active filter has green background

**New Task Button:**
- Top right corner
- Green background
- "+ New Task" text
- Opens inline form at top of list

**Empty State:**
- Icon: Clipboard
- Text: "No tasks yet"
- Button: "Create your first task"

---

### 7. **Connect Page** (`/connect`)

**Layout:** Centered card layout

**States:**

#### State 1: Disconnected
- Soft card container (max-w-2xl)
- Icon: Smartphone icon
- Heading: "Connect WhatsApp"
- Subtitle: "Scan QR code to connect your WhatsApp account"
- Button: "Connect WhatsApp" (green, prominent)

#### State 2: Connecting (QR Code)
- Loading spinner briefly
- Then QR code appears (centered, 256px)
- Instructions:
  1. Open WhatsApp on your phone
  2. Tap Menu > Linked Devices
  3. Tap "Link a Device"
  4. Point your phone at this screen to scan the code

**QR Code Container:**
- White background
- Padding around QR
- Subtle border
- Soft shadow

#### State 3: Connected
- Success checkmark (green)
- Heading: "Connected"
- User info:
  - Phone number
  - Connection time
- Button: "Disconnect" (secondary style)

**Activity Log:**
Below the main card:
- Terminal-style log
- Dark background
- Monospace font
- Color-coded messages:
  - Green for success
  - Yellow for warnings
  - Red for errors
  - White for info
- Auto-scrolls to bottom
- Max height: 300px

**Real-time Updates:**
- Uses Server-Sent Events (SSE)
- Updates connection status live
- Shows new messages in activity log

---

### 8. **Settings Page** (`/settings`)

**Layout:** Vertical document layout

**Sections:**

#### System Status
- Card with status indicators
- Database: Green/Red dot + "Connected"/"Disconnected"
- WhatsApp: Status with phone number (if connected)
- AI Service: Gemini model status

Each status row:
```
[Dot] Service Name    Status Text
```

#### Preferences
- Theme toggle: Light/Dark mode switch
- Auto-start WhatsApp: Toggle
- Notification preferences

#### Account
- Email (read-only)
- Full Name (editable)
- Phone (editable)
- Save button

#### Danger Zone
- Red border card
- "Clear all messages" button
- "Reset connection" button
- Confirmation modals for destructive actions

---

## 🎯 Navigation

### Sidebar

**Position:** Fixed left, full height

**Width:** 240px

**Structure:**
```
├─ Logo (top)
├─ Navigation Links
│   ├─ Dashboard (Home icon)
│   ├─ Messages (MessageSquare icon)
│   ├─ Action Items (CheckSquare icon)
│   ├─ Tasks (ListTodo icon)
│   ├─ Connect (Smartphone icon)
│   └─ Settings (Settings icon)
├─ Spacer
└─ User Profile (bottom)
    └─ Avatar + Name
```

**Link Design:**
- Inactive: Gray text, no background
- Hover: Light gray background
- Active: Green text, light green background
- Icon (left) + Text (center-left)
- Border radius: 8px
- Padding: 10px 14px

**Responsive:**
- Mobile: Collapses to hamburger menu
- Tablet: Icons only (narrow sidebar)

---

## 🎭 Animations & Transitions

### Page Transitions
- Fade in: 150ms
- Slide up: 200ms ease-out

### Hover Effects
- Scale up: 1.02 on hover (cards)
- Color transition: 200ms
- Opacity: 150ms

### Loading States
- Spinner: Rotating circle (WhatsApp green)
- Skeleton screens: Gray blocks with shimmer animation
- Progress bars: Green gradient

### Micro-interactions
- Button press: Scale down to 0.98
- Checkbox toggle: Bounce animation
- Success toast: Slide in from top-right

---

## 📊 Data Visualization

### Statistics Cards
- Large number (primary metric)
- Smaller label below
- Trend indicator (arrow + percentage)
- Icon in colored circle (left)

### Charts (if implemented)
- Bar charts for message counts
- Pie charts for category breakdown
- Line charts for timeline
- Color scheme: Use brand colors
- Hover tooltips with exact values

---

## 🌙 Dark Mode

**Toggle:** Settings page + keyboard shortcut (optional)

**Implementation:** CSS variables swap

**Key Changes:**
- Background: Dark gray (#1F2937)
- Text: Light gray (#F9FAFB)
- Cards: Slightly lighter gray (#374151)
- Borders: Subtle gray (#4B5563)
- Shadows: Lighter shadows (lower opacity)

**Preserved:**
- WhatsApp green remains the same
- Status colors remain the same
- Icons remain visible

---

## 🔤 Icons

**Library:** Lucide React

**Commonly Used:**
- Home (Dashboard)
- MessageSquare (Messages)
- CheckSquare (Action Items)
- ListTodo (Tasks)
- Smartphone (Connect)
- Settings (Settings)
- User (Profile)
- Search (Search)
- Filter (Filters)
- ChevronRight/Down (Expandable)
- Check (Checkbox checked)
- X (Close/Delete)
- Plus (Add new)
- Trash (Delete)
- Edit (Edit)
- MoreVertical (Menu)

**Size:** 20px standard, 16px for small contexts

---

## 📱 Responsive Design

### Breakpoints
```css
/* Mobile */
@media (max-width: 640px) { }

/* Tablet */
@media (min-width: 641px) and (max-width: 1024px) { }

/* Desktop */
@media (min-width: 1025px) { }
```

### Mobile Adaptations
- Sidebar becomes hamburger menu
- Stats grid: 2 columns instead of 4
- Tables become vertically stacked cards
- Floating action button for primary action
- Bottom navigation bar (optional)

### Tablet Adaptations
- Sidebar: Icon-only mode
- Stats grid: 2 or 3 columns
- Comfortable tap targets (44px minimum)

---

## ♿ Accessibility

### ARIA Labels
- All interactive elements have labels
- Buttons describe their action
- Icons paired with text or sr-only labels

### Keyboard Navigation
- Tab order follows visual order
- Enter/Space activates buttons
- Escape closes modals
- Arrow keys navigate lists (optional)

### Focus States
- Visible focus ring (2px green)
- Skip to content link
- Focus trap in modals

### Color Contrast
- All text meets WCAG AA standards
- 4.5:1 contrast for body text
- 3:1 contrast for large text

---

## 🎨 UI Patterns

### Empty States
**Pattern:**
```
Icon (48px, gray)
Heading ("No items yet")
Subtitle (explanation)
Action button (if applicable)
```

### Loading States
**Skeleton Screen:**
- Gray rectangles matching content layout
- Shimmer animation (left to right)
- Preserves layout structure

**Spinner:**
- Centered in container
- WhatsApp green color
- 40px diameter
- Rotating animation

### Error States
**Pattern:**
```
Icon (AlertTriangle, red)
Error heading
Error message (detailed)
Action buttons (Retry, Go Back)
```

### Success States
**Toast Notification:**
- Top-right corner
- Green background
- White text
- Check icon
- Auto-dismiss after 3 seconds
- Slide in/out animation

---

## 🖼️ Layout Grid

**Desktop:**
- Max content width: 1280px
- Main container: max-w-5xl (896px)
- Grid columns: 12-column system
- Gap: 24px

**Components:**
- Cards: Full width or grid-based
- Forms: Max 600px width
- Modals: Centered, fixed width

---

## 📐 Component States

### Interactive Elements

**Button States:**
1. Default
2. Hover (slight color change)
3. Active/Pressed (scale down)
4. Disabled (opacity 0.5, no pointer events)
5. Loading (spinner inside button)

**Input States:**
1. Default
2. Focus (green border, ring)
3. Error (red border)
4. Success (green checkmark icon)
5. Disabled (gray background)

**List Item States:**
1. Default
2. Hover (light background)
3. Selected (green-tinted background)
4. Active/Pressed
5. Expanded (for expandable rows)

---

## 🎯 User Flows

### Connect WhatsApp Flow
```
1. User clicks "Connect"
2. Loading spinner (2 seconds)
3. QR code appears with instructions
4. User scans with phone
5. Success message + redirect to Dashboard
```

### View Message Details Flow
```
1. User clicks message row
2. Row expands smoothly
3. Full content revealed
4. AI reasoning shown in gray box
5. Click outside or click again to collapse
```

### Create Task from Action Item Flow
```
1. User clicks "Convert to Task"
2. Modal opens with pre-filled info
3. User edits/confirms details
4. Click "Create Task"
5. Success toast appears
6. Task appears in Tasks page
7. Action item marked as completed
```

---

## 🎨 Design Tokens (CSS Variables)

```css
:root {
  /* Colors */
  --color-primary: #25D366;
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;
  
  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Typography */
  --font-size-xs: 0.625rem;
  --font-size-sm: 0.75rem;
  --font-size-base: 0.875rem;
  --font-size-lg: 1rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 2rem;
  
  /* Shadows */
  --shadow-sm: var(--shadow-soft);
  --shadow-md: var(--shadow-medium);
  --shadow-lg: var(--shadow-large);
  
  /* Border Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  /* Transitions */
  --transition-fast: 150ms;
  --transition-base: 200ms;
  --transition-slow: 300ms;
}
```

---

**End of UI Architecture Documentation**
