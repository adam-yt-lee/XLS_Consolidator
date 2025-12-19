/**
 * BOM層級處理器 - JavaScript版本
 * 使用統一遞迴在一次遍歷中同時計算SYS_CPN和Ttl. Usage
 */

class BOMHierarchyProcessor {
    /**
     * BOM層級處理器
     * 
     * @param {Array<Object>} data - BOM數據，包含LV、LN、Material、Part Number、Unit Usg等欄位
     * @param {string} pattern - 符合條件的Material前綴，如"45|43|64|X75|X66"
     */
    constructor(data, pattern) {
        this.data = JSON.parse(JSON.stringify(data)); // 深拷貝
        this.pattern = pattern;
        
        // 編譯正則表達式
        try {
            this.materialPattern = new RegExp(`^(${pattern})`);
        } catch (e) {
            console.error('Invalid pattern:', pattern);
            this.materialPattern = /^$/;
        }
        
        // 初始化Material索引
        this.materialIndex = new Map();
        this.cache = new Map();
        this.visited = new Set();
        
        // 構建Material索引
        this._buildMaterialIndex();
        
        // 統計信息
        this._printStats();
    }
    
    /**
     * 構建Material索引
     * 如果同一Material有多行，保留LN最大的（最接近末端的）
     * @private
     */
    _buildMaterialIndex() {
        for (let idx = 0; idx < this.data.length; idx++) {
            const row = this.data[idx];
            const material = String(row.Material || '').trim();
            
            if (material && material !== '') {
                const currentLN = row.LN || 0;
                
                if (!this.materialIndex.has(material)) {
                    this.materialIndex.set(material, idx);
                } else {
                    const existingIdx = this.materialIndex.get(material);
                    const existingLN = this.data[existingIdx].LN || 0;
                    
                    // 取LN最大的row
                    if (currentLN > existingLN) {
                        this.materialIndex.set(material, idx);
                    }
                }
            }
        }
    }
    
    /**
     * 打印初始化統計信息
     * @private
     */
    _printStats() {
        const uniqueProducts = new Set(this.data.map(row => row.Product)).size;
        console.log('✓ BOM Hierarchy Processor 初始化成功');
        console.log(`  - 總行數：${this.data.length}`);
        console.log(`  - Material索引數：${this.materialIndex.size}`);
        console.log(`  - 搜尋Pattern：${this.pattern}`);
        console.log(`  - Product數量：${uniqueProducts}`);
    }
    
    /**
     * 檢查Material是否符合Pattern
     * @param {string} material - Material值
     * @returns {boolean}
     */
    matchesPattern(material) {
        if (!material || material === '') {
            return false;
        }
        return this.materialPattern.test(String(material));
    }
    
    /**
     * 統一的層級遞迴遍歷函數
     * 
     * 邏輯：
     * 1. 從start_material開始，遞迴向上查詢Parent
     * 2. SYS_CPN：遇到第一個符合Pattern的Material則跳出
     * 3. Ttl. Usage：繼續遞迴到LV=0，累乘所有Parent的Unit Usg
     * 
     * @param {string} startMaterial - 起始Material
     * @param {number} initialUsage - 初始Unit Usg（用於累乘）
     * @param {number} depth - 遞迴深度
     * @param {number} maxDepth - 最大深度限制
     * @returns {[string, number]} [sys_cpn, ttl_usage]
     * @private
     */
    _traverseHierarchyUnified(startMaterial, initialUsage = 1.0, depth = 0, maxDepth = 20) {
        // 防止無限迴圈
        if (depth > maxDepth) {
            return [startMaterial, initialUsage];
        }
        
        try {
            // 找到當前Material對應的Row
            const currentIdx = this.materialIndex.get(startMaterial);
            if (currentIdx === undefined) {
                return [startMaterial, initialUsage];
            }
            
            const currentRow = this.data[currentIdx];
            const currentLV = currentRow.LV || -1;
            
            // 防止循環訪問
            if (this.visited.has(startMaterial)) {
                return [startMaterial, initialUsage];
            }
            
            this.visited.add(startMaterial);
            
            try {
                // 取得Parent的Part Number
                const parentPartNumber = currentRow['Part Number'] || '';
                
                // 檢查是否已到達LV=0（頂層）
                if (currentLV <= 0 || !parentPartNumber || parentPartNumber === '') {
                    return [startMaterial, initialUsage];
                }
                
                // 找到Parent
                const parentMaterial = String(parentPartNumber).trim();
                const parentIdx = this.materialIndex.get(parentMaterial);
                
                if (parentIdx === undefined) {
                    // Parent不在數據中，視為到達頂層
                    return [startMaterial, initialUsage];
                }
                
                const parentRow = this.data[parentIdx];
                
                // 提取Parent的Unit Usg
                let parentUnitUsg = parentRow['Unit Usg'] || 1.0;
                if (isNaN(parentUnitUsg)) {
                    parentUnitUsg = 1.0;
                } else {
                    parentUnitUsg = parseFloat(parentUnitUsg);
                }
                
                // 累乘Usage
                const newUsage = initialUsage * parentUnitUsg;
                
                // 檢查Parent是否符合Pattern
                if (this.matchesPattern(parentRow.Material)) {
                    // 找到符合Pattern的Parent，SYS_CPN返回此Parent
                    // 但Ttl. Usage繼續累乘到LV=0
                    const [_, finalTtlUsage] = this._traverseHierarchyUnified(
                        parentMaterial,
                        newUsage,
                        depth + 1,
                        maxDepth
                    );
                    return [parentRow.Material, finalTtlUsage];
                }
                
                // Parent不符合Pattern，繼續向上遞迴
                const [parentSysCpn, parentTtlUsage] = this._traverseHierarchyUnified(
                    parentMaterial,
                    newUsage,
                    depth + 1,
                    maxDepth
                );
                
                return [parentSysCpn, parentTtlUsage];
            } finally {
                this.visited.delete(startMaterial);
            }
        } catch (e) {
            console.error(`遍歷層級時出錯 (Material: ${startMaterial}):`, e);
            return [startMaterial, initialUsage];
        }
    }
    
    /**
     * 處理所有行，返回添加了SYS_CPN和Ttl. Usage欄位的數據
     * 
     * @returns {Array<Object>} 處理後的數據
     */
    process() {
        console.log(`\n開始處理 ${this.data.length} 行數據...`);
        
        const sysCpnResults = [];
        const ttlUsageResults = [];
        
        for (let idx = 0; idx < this.data.length; idx++) {
            const row = this.data[idx];
            const currentMaterial = String(row.Material || '');
            const currentLV = row.LV;
            
            // 取得當前行的Unit Usg
            let unitUsg = row['Unit Usg'] || 1.0;
            if (isNaN(unitUsg)) {
                unitUsg = 1.0;
            } else {
                unitUsg = parseFloat(unitUsg);
            }
            
            // 步驟1：LV檢查
            if (currentLV <= 1) {
                sysCpnResults.push(currentMaterial);
                ttlUsageResults.push(unitUsg);
                continue;
            }
            
            // 步驟2：Material本身已符合Pattern
            if (this.matchesPattern(currentMaterial)) {
                sysCpnResults.push(currentMaterial);
                
                // 計算Ttl. Usage
                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    currentMaterial,
                    unitUsg
                );
                ttlUsageResults.push(ttlUsage);
                continue;
            }
            
            // 步驟3：遞迴向上查詢
            const currentPartNumber = row['Part Number'] || '';
            
            if (!currentPartNumber || currentPartNumber === '') {
                // 沒有Part Number，無法向上查詢
                sysCpnResults.push(currentMaterial);
                ttlUsageResults.push(unitUsg);
                continue;
            }
            
            // 清空本次查詢的訪問記錄
            this.visited.clear();
            
            // 檢查Part Number對應的Material
            const parentMaterialStr = String(currentPartNumber).trim();
            
            // 先檢查Part Number本身是否符合Pattern
            if (this.matchesPattern(parentMaterialStr)) {
                // Part Number本身就符合Pattern
                sysCpnResults.push(parentMaterialStr);
                
                // 計算Ttl. Usage
                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    parentMaterialStr,
                    unitUsg
                );
                ttlUsageResults.push(ttlUsage);
            } else {
                // Part Number不符合Pattern，向上遞迴查詢
                const [sysCpn, ttlUsage] = this._traverseHierarchyUnified(
                    parentMaterialStr,
                    unitUsg
                );
                
                sysCpnResults.push(sysCpn || currentMaterial);
                ttlUsageResults.push(ttlUsage);
            }
        }
        
        // 將結果添加到原數據
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].SYS_CPN = sysCpnResults[i];
            this.data[i]['Ttl. Usage'] = ttlUsageResults[i];
        }
        
        console.log('✓ 處理完成');
        return this.data;
    }
    
    /**
     * 獲取統計信息
     * @returns {Object}
     */
    getStatistics() {
        const sysCpnChanged = this.data.filter(row => row.Material !== row.SYS_CPN).length;
        const ttlUsages = this.data.map(row => row['Ttl. Usage'] || 0).filter(v => !isNaN(v));
        
        return {
            totalRows: this.data.length,
            sysCpnChanged: sysCpnChanged,
            sysCpnChangedPercent: ((sysCpnChanged / this.data.length) * 100).toFixed(1),
            sysCpnUnchanged: this.data.length - sysCpnChanged,
            sysCpnUnchangedPercent: (((this.data.length - sysCpnChanged) / this.data.length) * 100).toFixed(1),
            ttlUsageAvg: ttlUsages.length > 0 ? (ttlUsages.reduce((a, b) => a + b, 0) / ttlUsages.length).toFixed(4) : 0,
            ttlUsageMin: ttlUsages.length > 0 ? Math.min(...ttlUsages).toFixed(4) : 0,
            ttlUsageMax: ttlUsages.length > 0 ? Math.max(...ttlUsages).toFixed(4) : 0,
            ttlUsageStd: ttlUsages.length > 0 ? this._calculateStdDev(ttlUsages).toFixed(4) : 0
        };
    }
    
    /**
     * 計算標準差
     * @private
     */
    _calculateStdDev(arr) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }
    
    /**
     * 獲取指定行數的樣本數據
     * @param {number} limit - 行數限制
     * @returns {Array<Object>}
     */
    getSamples(limit = 20) {
        // 取LV>1且Material != SYS_CPN的行
        return this.data
            .filter(row => row.LV > 1 && row.Material !== row.SYS_CPN)
            .slice(0, limit);
    }
}

/**
 * 工具函數：將CSV字符串解析為數組
 * @param {string} csvContent - CSV內容
 * @returns {Array<Object>}
 */
function parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return [];
    
    // 解析header
    const headers = lines[0].split(',').map(h => h.trim());
    
    // 解析行
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        
        headers.forEach((header, idx) => {
            const value = values[idx] || '';
            // 嘗試轉換為數字
            row[header] = isNaN(value) ? value : parseFloat(value);
        });
        
        data.push(row);
    }
    
    return data;
}

/**
 * 工具函數：將數據轉換為CSV字符串
 * @param {Array<Object>} data - 數據數組
 * @returns {string}
 */
function dataToCSV(data) {
    if (data.length === 0) return '';
    
    // 獲取所有key
    const headers = Object.keys(data[0]);
    
    // 構建CSV
    let csv = headers.join(',') + '\n';
    
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header];
            // 如果值包含逗號或換行，需要用引號包裹
            if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value === undefined ? '' : value;
        });
        csv += values.join(',') + '\n';
    }
    
    return csv;
}

// 導出供外部使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BOMHierarchyProcessor, parseCSV, dataToCSV };
}
