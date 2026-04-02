# Food Expiration Tracker

Food Expiration Tracker is a full-stack web application for managing perishable inventory.
It helps teams scan products, track expiry status, process donation/return/recycle actions, and export inventory reports.

## What It Solves

Supermarkets and food vendors often lose track of expiry timelines, resulting in waste and missed donation opportunities.
This app creates a single workflow to:

- Capture products via QR scan or manual entry
- Automatically group inventory by freshness
- Process bulk actions on selected products
- Keep persistent data between sessions
- Export a CSV report for audits and operations

## Features

- Multi-page UI: Dashboard, Inventory, Reports
- QR-based product capture (camera)
- Manual product entry form
- Auto-classification: `fresh`, `expiring-soon`, `expired`
- Bulk actions: donate, return, recycle
- Reward points for recycling actions
- Activity timeline for operational tracking
- CSV export for reporting
- Backend persistence using JSON storage

## Tech Stack

Frontend:

- HTML5
- CSS3
- JavaScript (ES6+)
- html5-qrcode

Backend:

- Node.js
- Express
- File-based JSON datastore (`data/products.json`)

## Project Structure

```text
hackfinity/
|- data/
|  |- products.json
|- index.html
|- inventory.html
|- reports.html
|- script.js
|- styles.css
|- server.js
|- package.json
```

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd hackfinity
npm install
```

### 2. Run

```bash
npm start
```

Server runs at:

```text
http://localhost:3000
```

## Pages

- `/` - Dashboard
- `/inventory` - Inventory management
- `/reports` - Reports and export

## API Endpoints

- `GET /api/products` - List products with summary
- `GET /api/summary` - Summary metrics and recent activity
- `POST /api/products` - Add product (manual or QR source)
- `POST /api/actions` - Run bulk action (`donate`, `return`, `recycle`)
- `DELETE /api/products/:id` - Remove one product
- `GET /api/reports/overview` - Reporting payload
- `GET /api/reports/export.csv` - Download CSV export

## QR Data Format

QR data supports either JSON or line-based text.

JSON example:

```json
{
	"productName": "Fresh Milk",
	"batchNumber": "B-2048",
	"manufacturingDate": "2026-04-01",
	"expiryDate": "2026-04-10"
}
```

Text example:

```text
Product Name: Fresh Milk
Manufacturing Date: 2026-04-01
Expiry Date: 2026-04-10
Batch Number: B-2048
```

## Configuration

- `PORT` (optional): backend port, default is `3000`

Example:

```bash
set PORT=4000
npm start
```

## Troubleshooting

- If you see `EADDRINUSE`, port `3000` is already in use.
	Stop the existing process or run on a different port via `PORT`.
- If camera scan is unavailable, ensure browser permissions allow camera access.

## Team

- Selma Mary Paul - UI/UX
- Merin Elizabeth Edgar - HTML/CSS/JavaScript
- Thanushree Suresh - HTML/CSS/JavaScript
