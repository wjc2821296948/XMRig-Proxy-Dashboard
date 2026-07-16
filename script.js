let API_URL = localStorage.getItem('xmrig_api_url') || '';
let refreshInterval;

function showConfig() {
    const currentUrl = localStorage.getItem('xmrig_api_url') || '';
    document.getElementById('dashboard').innerHTML = `
        <div class="config-panel">
            <div class="config-title">Configure API Endpoint</div>
            <div class="input-group">
                <label class="input-label">XMRig Proxy API URL</label>
                <input type="text" 
                       class="input-field" 
                       id="apiUrlInput" 
                       value="${currentUrl}"
                       placeholder="http://127.0.0.1:8080/1/summary">
            </div>
            <div>
                <button class="btn" onclick="saveConfig()">Save & Connect</button>
                ${currentUrl ? '<button class="btn btn-secondary" onclick="cancelConfig()">Cancel</button>' : ''}
            </div>
        </div>
    `;
}

function saveConfig() {
    const url = document.getElementById('apiUrlInput').value.trim();
    if (!url) {
        alert('Please enter a valid API URL');
        return;
    }
    localStorage.setItem('xmrig_api_url', url);
    API_URL = url;
    document.getElementById('dashboard').innerHTML = '<div class="loading"><p>Connecting...</p></div>';
    fetchData();
}

function cancelConfig() {
    document.getElementById('dashboard').innerHTML = '<div class="loading"><p>Loading dashboard data...</p></div>';
    fetchData();
}

function formatHashrate(value) {
    if (!value) return '0 H/s';
    // Values from API are in KH/s
    if (value >= 1000) return (value / 1000).toFixed(2) + ' MH/s';
    return value.toFixed(2) + ' KH/s';
}

function formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getStatusClass(data) {
    if (!data || !data.miners) return 'status-offline';
    if (data.miners.now === 0) return 'status-offline';
    if (data.miners.now < data.miners.max * 0.5) return 'status-warning';
    return 'status-online';
}

function getStatusText(data) {
    if (!data || !data.miners) return 'Offline';
    if (data.miners.now === 0) return 'Offline';
    if (data.miners.now < data.miners.max * 0.5) return 'Warning';
    return 'Online';
}

function renderDashboard(data) {
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.className = 'status-badge ' + getStatusClass(data);
    statusBadge.textContent = getStatusText(data);

    document.getElementById('workerId').textContent = `Worker: ${data.worker_id} | Version: ${data.version}`;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

    const hashrates = data.hashrate.total || [];
    const maxHashrate = Math.max(...hashrates);
    const hashrateBarHTML = hashrates.map(h => {
        const height = (h / maxHashrate * 100);
        return `<div class="hashrate-bar" style="height: ${height}%"></div>`;
    }).join('');

    const memoryUsedPercent = ((data.resources.memory.total - data.resources.memory.free) / data.resources.memory.total * 100).toFixed(1);
    const acceptanceRate = (data.results.accepted / (data.results.accepted + data.results.rejected) * 100).toFixed(2);

    const html = `
        <div class="grid">
            <div class="card">
                <div class="card-title">Current Hashrate</div>
                <div class="card-value highlight-green">${formatHashrate(hashrates[0])}</div>
                <div class="card-label">10s average</div>
                <div class="hashrate-chart">${hashrateBarHTML}</div>
            </div>

            <div class="card">
                <div class="card-title">Active Miners</div>
                <div class="card-value ${data.miners.now > 0 ? 'highlight-green' : 'highlight-red'}">${formatNumber(data.miners.now)}</div>
                <div class="card-label">Peak: ${formatNumber(data.miners.max)} miners</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${(data.miners.now / data.miners.max * 100)}%"></div>
                </div>
            </div>

            <div class="card">
                <div class="card-title">Workers Connected</div>
                <div class="card-value highlight-blue">${data.workers}</div>
                <div class="card-label">Ratio: ${data.upstreams.ratio.toFixed(1)} miners/upstream</div>
            </div>

            <div class="card">
                <div class="card-title">Uptime</div>
                <div class="card-value">${formatUptime(data.uptime)}</div>
                <div class="card-label">Since last restart</div>
            </div>
        </div>

        <div class="grid">
            <div class="card large-card">
                <div class="card-title">Hashrate Performance</div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value highlight-green">${formatHashrate(hashrates[0])}</div>
                        <div class="metric-label">10 Seconds</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatHashrate(hashrates[1])}</div>
                        <div class="metric-label">1 Minute</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatHashrate(hashrates[2])}</div>
                        <div class="metric-label">15 Minutes</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatHashrate(hashrates[3])}</div>
                        <div class="metric-label">1 Hour</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatHashrate(hashrates[4])}</div>
                        <div class="metric-label">12 Hours</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatHashrate(hashrates[5])}</div>
                        <div class="metric-label">24 Hours</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-title">System Resources</div>
                <div class="stat-row">
                    <span class="stat-label">Memory Used</span>
                    <span class="stat-value">${formatBytes(data.resources.memory.total - data.resources.memory.free)}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${memoryUsedPercent}%"></div>
                </div>
                <div class="stat-row" style="margin-top: 12px;">
                    <span class="stat-label">Total Memory</span>
                    <span class="stat-value">${formatBytes(data.resources.memory.total)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">RSS Memory</span>
                    <span class="stat-value">${formatBytes(data.resources.memory.resident_set_memory)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Load Average</span>
                    <span class="stat-value">${data.resources.load_average.join(' / ')}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">CPU Cores</span>
                    <span class="stat-value">${data.resources.hardware_concurrency}</span>
                </div>
            </div>

            <div class="card">
                <div class="card-title">Upstream Pools</div>
                <div class="stat-row">
                    <span class="stat-label">Active</span>
                    <span class="stat-value highlight-green">${data.upstreams.active}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Sleeping</span>
                    <span class="stat-value">${data.upstreams.sleep}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Error</span>
                    <span class="stat-value ${data.upstreams.error > 0 ? 'highlight-red' : ''}">${data.upstreams.error}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Total</span>
                    <span class="stat-value">${data.upstreams.total}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Avg Miners/Pool</span>
                    <span class="stat-value">${data.upstreams.ratio.toFixed(1)}</span>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card large-card">
                <div class="card-title">Mining Results</div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value highlight-green">${formatNumber(data.results.accepted)}</div>
                        <div class="metric-label">Accepted</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value highlight-red">${formatNumber(data.results.rejected)}</div>
                        <div class="metric-label">Rejected</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value highlight-yellow">${formatNumber(data.results.invalid)}</div>
                        <div class="metric-label">Invalid</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatNumber(data.results.expired)}</div>
                        <div class="metric-label">Expired</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value highlight-blue">${acceptanceRate}%</div>
                        <div class="metric-label">Acceptance Rate</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${data.results.latency} ms</div>
                        <div class="metric-label">Latency</div>
                    </div>
                </div>
                <div class="stat-row" style="margin-top: 15px;">
                    <span class="stat-label">Total Hashes</span>
                    <span class="stat-value">${formatNumber(data.results.hashes_total)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Average Submit Time</span>
                    <span class="stat-value">${data.results.avg_time} sec</span>
                </div>
            </div>
        </div>
    `;

    document.getElementById('dashboard').innerHTML = html;
    document.getElementById('dashboard').className = '';
}

function showError(message) {
    document.getElementById('dashboard').innerHTML = `
        <div class="error">
            <strong>Error:</strong> ${message}
        </div>
    `;
    document.getElementById('statusBadge').className = 'status-badge status-offline';
    document.getElementById('statusBadge').textContent = 'Offline';
}

async function fetchData() {
    if (!API_URL) {
        showConfig();
        return;
    }
    
    try {
        console.log('Fetching data from:', API_URL);
        const response = await fetch(API_URL);
        console.log('Response status:', response.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log('Data received:', data);
        renderDashboard(data);
    } catch (error) {
        console.error('Fetch error:', error);
        showError(`Failed to fetch data: ${error.message}`);
    }
}

// Initial load
fetchData();

// Auto-refresh every 10 seconds
refreshInterval = setInterval(fetchData, 10000);
