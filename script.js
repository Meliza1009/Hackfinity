const API_BASE = '';

class FoodExpiryTracker {
    constructor() {
        this.products = [];
        this.rewardPoints = 0;
        this.summary = {
            total: 0,
            fresh: 0,
            'expiring-soon': 0,
            expired: 0,
            rewardPoints: 0
        };
        this.activity = [];
        this.page = document.body.dataset.page || 'dashboard';
        this.foodBanks = [
            { id: 1, name: 'Community Food Bank' },
            { id: 2, name: 'Hope Food Center' },
            { id: 3, name: 'Local Food Pantry' }
        ];

        this.initializeEventListeners();
        this.bootstrap();
    }

    async bootstrap() {
        await this.refreshData();

        if (this.page === 'dashboard') {
            this.initializeQRScanner();
        }

        if (this.page === 'inventory') {
            this.renderInventoryPage();
        }

        if (this.page === 'reports') {
            this.renderReportsPage();
        }
    }

    async refreshData() {
        const response = await fetch(`${API_BASE}/api/summary`);
        const payload = await response.json();
        this.summary = payload.summary || this.summary;
        this.activity = payload.activity || [];
        this.rewardPoints = this.summary.rewardPoints || 0;

        const productResponse = await fetch(`${API_BASE}/api/products`);
        const productPayload = await productResponse.json();
        this.products = productPayload.products || [];

        this.updateMetrics();
        this.updateRewardPointsDisplay();
    }

    initializeEventListeners() {
        const form = document.getElementById('product-form');
        if (form) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleManualEntry();
            });
        }

        const donateButton = document.getElementById('donate-btn');
        const returnButton = document.getElementById('return-btn');
        const recycleButton = document.getElementById('recycle-btn');
        const foodBankSelect = document.getElementById('foodBankSelect');

        if (foodBankSelect) {
            foodBankSelect.addEventListener('change', () => this.updateFoodBankLabel());
        }

        if (donateButton) {
            donateButton.addEventListener('click', () => this.handleAction('donate'));
        }

        if (returnButton) {
            returnButton.addEventListener('click', () => this.handleAction('return'));
        }

        if (recycleButton) {
            recycleButton.addEventListener('click', () => this.handleAction('recycle'));
        }

        const exportButton = document.getElementById('exportCsvBtn');
        if (exportButton) {
            exportButton.addEventListener('click', () => {
                window.location.href = `${API_BASE}/api/reports/export.csv`;
            });
        }

        const refreshButton = document.getElementById('refreshReportBtn');
        if (refreshButton) {
            refreshButton.addEventListener('click', async () => {
                await this.refreshData();
                this.renderReportsPage();
            });
        }
    }

    initializeQRScanner() {
        const qrReader = document.getElementById('qr-reader');
        if (!qrReader || typeof Html5QrcodeScanner === 'undefined') {
            return;
        }

        this.html5QrcodeScanner = new Html5QrcodeScanner('qr-reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: true
        });

        const onScanSuccess = (decodedText) => {
            this.handleQRData(decodedText);
        };

        const onScanError = () => {};

        this.html5QrcodeScanner.render(onScanSuccess, onScanError);

        const restartButton = document.createElement('button');
        restartButton.type = 'button';
        restartButton.textContent = 'Restart Scanner';
        restartButton.className = 'restart-scanner-btn';
        restartButton.addEventListener('click', () => this.restartScanner());
        qrReader.parentElement.appendChild(restartButton);
    }

    async handleQRData(data) {
        const scanResult = document.getElementById('scan-result');
        if (!scanResult) {
            return;
        }

        try {
            let productData;

            try {
                const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                productData = {
                    name: parsedData.productName || parsedData.name || '',
                    batchNumber: parsedData.batchNumber || parsedData.batch || '',
                    manufacturingDate: parsedData.manufacturingDate || parsedData.mfgDate || '',
                    expiryDate: parsedData.expiryDate || parsedData.expDate || ''
                };
            } catch {
                const lines = String(data).split('\n');
                productData = {
                    name: lines[0]?.split(': ')[1] || '',
                    manufacturingDate: lines[1]?.split(': ')[1] || '',
                    expiryDate: lines[2]?.split(': ')[1] || '',
                    batchNumber: lines[3]?.split(': ')[1] || ''
                };
            }

            const response = await fetch(`${API_BASE}/api/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...productData,
                    source: 'qr'
                })
            });

            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.message || 'Unable to add scanned product.');
            }

            this.products = [payload.product, ...this.products];
            this.summary = payload.summary || this.summary;
            this.updateMetrics();
            this.updateRewardPointsDisplay();

            scanResult.innerHTML = `
                <div class="scan-result success">
                    <h3>Product Successfully Added</h3>
                    <p>Product Name: ${payload.product.name}</p>
                    <p>Manufacturing Date: ${payload.product.manufacturingDate}</p>
                    <p>Expiry Date: ${payload.product.expiryDate}</p>
                    <p>Batch Number: ${payload.product.batchNumber}</p>
                </div>
            `;

            this.restartScanner();
            await this.refreshData();
            this.renderCurrentPage();
        } catch (error) {
            scanResult.innerHTML = `
                <div class="scan-result error">
                    <h3>Error Scanning Product</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    restartScanner() {
        if (!this.html5QrcodeScanner) {
            return;
        }

        this.html5QrcodeScanner.clear().then(() => {
            const qrReader = document.getElementById('qr-reader');
            if (qrReader) {
                qrReader.innerHTML = '';
                this.initializeQRScanner();
            }
        }).catch(() => {});
    }

    async handleManualEntry() {
        const productData = {
            name: document.getElementById('productName')?.value.trim(),
            batchNumber: document.getElementById('productNumber')?.value.trim(),
            manufacturingDate: document.getElementById('mfgDate')?.value,
            expiryDate: document.getElementById('expDate')?.value,
            source: 'manual'
        };

        if (!productData.name || !productData.batchNumber || !productData.manufacturingDate || !productData.expiryDate) {
            alert('All fields are required');
            return;
        }

        const response = await fetch(`${API_BASE}/api/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });

        const payload = await response.json();
        if (!response.ok) {
            alert(payload.message || 'Unable to save product.');
            return;
        }

        const form = document.getElementById('product-form');
        if (form) {
            form.reset();
        }

        await this.refreshData();
        this.renderCurrentPage();
    }

    getSelectedProducts() {
        const checkboxes = document.querySelectorAll('.product-item input[type="checkbox"]:checked:not(:disabled)');
        return Array.from(checkboxes)
            .map((checkbox) => this.products.find((product) => Number(product.id) === Number(checkbox.dataset.id)))
            .filter(Boolean);
    }

    async handleAction(action) {
        const selectedProducts = this.getSelectedProducts();
        if (selectedProducts.length === 0) {
            alert('Please select products first');
            return;
        }

        if (action === 'donate') {
            const foodBankSelect = document.getElementById('foodBankSelect');
            if (!foodBankSelect?.value) {
                alert('Please select a food bank for donation');
                return;
            }
        }

        const response = await fetch(`${API_BASE}/api/actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                productIds: selectedProducts.map((product) => product.id),
                foodBankId: document.getElementById('foodBankSelect')?.value || ''
            })
        });

        const payload = await response.json();
        if (!response.ok) {
            alert(payload.message || 'Action failed.');
            return;
        }

        if (action === 'donate') {
            alert(`Donation confirmed for ${payload.removedCount} item(s).`);
        }

        if (action === 'return') {
            alert(`Return request placed for ${payload.removedCount} item(s).`);
        }

        if (action === 'recycle') {
            alert(`Recycling logged. You earned ${payload.rewardPointsEarned} points.`);
        }

        this.products = this.products.filter((product) => !selectedProducts.some((selected) => Number(selected.id) === Number(product.id)));
        this.summary = payload.summary || this.summary;
        this.activity = payload.activity || this.activity;

        await this.refreshData();
        this.renderCurrentPage();
    }

    renderCurrentPage() {
        if (this.page === 'inventory') {
            this.renderInventoryPage();
        }

        if (this.page === 'reports') {
            this.renderReportsPage();
        }

        if (this.page === 'dashboard') {
            this.updateFoodBankLabel();
        }
    }

    renderInventoryPage() {
        this.renderProductLists();
        this.updateFoodBankLabel();
    }

    renderReportsPage() {
        this.renderSummaryCard();
        this.renderActivityFeed();
    }

    renderProductLists() {
        const freshList = document.querySelector('#fresh-products .product-list');
        const expiringSoonList = document.querySelector('#expiring-soon .product-list');
        const expiredList = document.querySelector('#expired .product-list');

        if (!freshList || !expiringSoonList || !expiredList) {
            return;
        }

        freshList.innerHTML = '';
        expiringSoonList.innerHTML = '';
        expiredList.innerHTML = '';

        const groupedProducts = [...this.products].sort((left, right) => new Date(left.expiryDate) - new Date(right.expiryDate));
        const stockLevels = groupedProducts.reduce((accumulator, product) => {
            accumulator[product.batchNumber] = (accumulator[product.batchNumber] || 0) + 1;
            return accumulator;
        }, {});

        const buckets = {
            fresh: freshList,
            'expiring-soon': expiringSoonList,
            expired: expiredList
        };

        Object.entries(buckets).forEach(([status, list]) => {
            const productsForStatus = groupedProducts.filter((product) => product.status === status);
            if (productsForStatus.length === 0) {
                const emptyState = document.createElement('li');
                emptyState.className = 'empty-state';
                emptyState.textContent = `No ${status.replace('-', ' ')} products yet.`;
                list.appendChild(emptyState);
                return;
            }

            productsForStatus.forEach((product) => {
                list.appendChild(this.createProductListItem(product, stockLevels[product.batchNumber]));
            });
        });

        this.updateMetrics();
    }

    createProductListItem(product, stockLevel) {
        const li = document.createElement('li');
        li.className = `product-item ${product.status}`;

        const daysUntilExpiry = Math.ceil((new Date(product.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
        const isExpired = product.status === 'expired';

        li.innerHTML = `
            <div class="product-info">
                <input type="checkbox" data-id="${product.id}" ${isExpired ? 'disabled' : ''}>
                <div class="product-details">
                    <h3>${product.name}</h3>
                    <div class="details-grid">
                        <span>Batch: ${product.batchNumber}</span>
                        <span>Stock Level: ${stockLevel} items</span>
                        <span>Mfg Date: ${new Date(product.manufacturingDate).toLocaleDateString()}</span>
                        <span>Exp Date: ${new Date(product.expiryDate).toLocaleDateString()}</span>
                        <span class="expiry-days ${product.status}">${daysUntilExpiry > 0 ? `${daysUntilExpiry} days until expiry` : 'Expired'}</span>
                        ${isExpired ? '<span class="expired-warning">This item cannot be donated as it has expired</span>' : ''}
                    </div>
                </div>
            </div>
        `;

        return li;
    }

    renderSummaryCard() {
        const summaryCard = document.getElementById('summaryCard');
        if (!summaryCard) {
            return;
        }

        summaryCard.innerHTML = `
            <div class="summary-grid">
                <div class="summary-stat">
                    <span>Total Items</span>
                    <strong>${this.summary.total}</strong>
                </div>
                <div class="summary-stat">
                    <span>Fresh</span>
                    <strong>${this.summary.fresh}</strong>
                </div>
                <div class="summary-stat">
                    <span>Expiring Soon</span>
                    <strong>${this.summary['expiring-soon']}</strong>
                </div>
                <div class="summary-stat">
                    <span>Expired</span>
                    <strong>${this.summary.expired}</strong>
                </div>
                <div class="summary-stat">
                    <span>Reward Points</span>
                    <strong>${this.rewardPoints}</strong>
                </div>
                <div class="summary-stat">
                    <span>Inventory Health</span>
                    <strong>${this.summary.total > 0 ? `${Math.round((this.summary.fresh / this.summary.total) * 100)}%` : '0%'}</strong>
                </div>
            </div>
        `;
    }

    renderActivityFeed() {
        const activityFeed = document.getElementById('activityFeed');
        if (!activityFeed) {
            return;
        }

        if (this.activity.length === 0) {
            activityFeed.innerHTML = '<div class="empty-state">No activity yet. Add items or process an action to create a report.</div>';
            return;
        }

        activityFeed.innerHTML = this.activity
            .slice()
            .reverse()
            .map((entry) => `
                <article class="activity-item">
                    <strong>${entry.type.replace(/-/g, ' ').toUpperCase()}</strong>
                    <span>${entry.detail}</span>
                    <span>${new Date(entry.createdAt).toLocaleString()}</span>
                </article>
            `)
            .join('');
    }

    updateFoodBankLabel() {
        const select = document.getElementById('foodBankSelect');
        const label = document.getElementById('selectedFoodBankLabel');
        if (!select || !label) {
            return;
        }

        const selected = this.foodBanks.find((foodBank) => String(foodBank.id) === String(select.value));
        label.textContent = selected ? selected.name : 'None';
    }

    updateMetrics() {
        const totalProducts = document.getElementById('totalProducts');
        const freshCount = document.getElementById('freshCount');
        const expiringSoonCount = document.getElementById('expiringSoonCount');
        const expiredCount = document.getElementById('expiredCount');

        if (totalProducts) {
            totalProducts.textContent = this.summary.total;
        }

        if (freshCount) {
            freshCount.textContent = this.summary.fresh;
        }

        if (expiringSoonCount) {
            expiringSoonCount.textContent = this.summary['expiring-soon'];
        }

        if (expiredCount) {
            expiredCount.textContent = this.summary.expired;
        }
    }

    updateRewardPointsDisplay() {
        const pointsDisplay = document.getElementById('rewardPoints');
        if (pointsDisplay) {
            pointsDisplay.textContent = this.rewardPoints;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FoodExpiryTracker();
});
