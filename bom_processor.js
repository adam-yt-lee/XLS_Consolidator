/**
 * BOM層級處理器
 * 版本：v2.5.0 (2025-01-23)
 * 功能：
 *   - 支持簡化的LV限制規則 {lv: 2, prefix: 'DCS'}
 *   - operator 固定為 <= (自動)
 *   - 支持單個或多個特殊LV規則
 *   - 自動TTL使用量計算
 *   - Material層級索引和快速查詢
 *   - LN 自動重新編號（修正原始檔案錯誤）
 *
 * 更新記錄：
 *   v2.5.0 (2025-01-23) - 新增 LN 自動重新編號功能
 *   v2.4.0 (2025-01-23) - 簡化設計：移除 operator 參數，固定為 <=
 *   v2.3.0 (2025-01-23) - 支持 operator 操作符設計
 *   v2.2.0 (2025-01-23) - 支持LV範圍限制（minLv/maxLv）
 *   v2.1.0 (2025-01-23) - 支持多規則、完整註記版本
 *   v2.0.0 (2025-01-22) - 初始實現特殊LV規則
 *   v1.0.0 (2024-12-22) - 基礎功能
 */

class BOMHierarchyProcessor {
    /**
     * BOM層級處理器
     * 
     * @param {Array<Object>} data - BOM數據
     * @param {string} pattern - 符合條件的Material前綴，如"45|43|64|X75|X66"
     * @param {Object|Array|null} lvSpecialRules - 特殊LV層級規則
     *        - null: 無特殊規則
     *        - {lv: 2, prefix: 'DCS'}: LV <= 2 返回自身，LV > 2 向上尋找
     *        - [{lv: 2, prefix: 'DCS'}, {lv: 3, prefix: 'XYZ'}]: 多個規則
     * 
     * 行為（固定 operator 為 <=）：
     *   LV <= 規則中的 lv 值 → 返回自身
     *   LV > 規則中的 lv 值 → 向上尋找
     */
    constructor(data, pattern, lvSpecialRules = null) {
        this.data = JSON.parse(JSON.stringify(data)); // 深拷貝
        this.pattern = pattern;
        this.lvSpecialRules = lvSpecialRules;

        // 重新編號 LN（修正原始檔案的錯誤編號）
        this._reindexLN();

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
     * 重新編號 LN 列
     * 修正原始檔案中可能存在的錯誤編號，從 1 開始順序編號
     * @private
     */
    _reindexLN() {
        if (this.data.length === 0) {
            return;
        }

        let sequence = 1;
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].LN = sequence++;
        }

        console.log(`✓ LN 重新編號完成：1-${sequence - 1}`);
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
        
        if (this.lvSpecialRules) {
            if (Array.isArray(this.lvSpecialRules)) {
                console.log(`  - 特殊規則數：${this.lvSpecialRules.length}`);
                this.lvSpecialRules.forEach((rule, idx) => {
                    console.log(`    └─ 規則${idx + 1}：LV <= ${rule.lv} 且 前綴='${rule.prefix}' (返回自身)`);
                });
            } else {
                console.log(`  - 特殊規則：LV <= ${this.lvSpecialRules.lv} 且 前綴='${this.lvSpecialRules.prefix}' (返回自身)`);
            }
        }
        
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
     * 檢查Material是否以指定前綴開頭
     * @param {string} material
     * @param {string} prefix
     * @returns {boolean}
     * @private
     */
    _startsWith(material, prefix) {
        return String(material || '').trim().startsWith(prefix);
    }
    
    /**
     * 檢查是否符合特殊LV規則（返回自身）
     * 
     * 配置方式：
     * {lv: 2, prefix: 'DCS'}
     *   - LV <= 2 時返回自身
     *   - LV > 2 時向上尋找
     * 
     * @param {number} lv
     * @param {string} material
     * @returns {boolean}
     * @private
     */
    _matchesLVSpecialRule(lv, material) {
        if (!this.lvSpecialRules) {
            return false;
        }
        
        // 如果是陣列，檢查是否符合任一規則
        if (Array.isArray(this.lvSpecialRules)) {
            return this.lvSpecialRules.some(rule =>
                this._checkSingleRule(lv, material, rule)
            );
        }
        
        // 單個物件
        return this._checkSingleRule(lv, material, this.lvSpecialRules);
    }
    
    /**
     * 檢查單個規則是否匹配（返回自身）
     * 固定 operator 為 <=
     * @private
     */
    _checkSingleRule(lv, material, rule) {
        // 檢查前綴
        if (!this._startsWith(material, rule.prefix)) {
            return false;
        }
        
        // 固定使用 <= 判斷
        return lv <= rule.lv;
    }
    
    /**
     * 統一的層級遞迴遍歷函數
     * @private
     */
    _traverseHierarchyUnified(startMaterial, initialUsage = 1.0, depth = 0, maxDepth = 20) {
        if (depth > maxDepth) {
            return [startMaterial, initialUsage];
        }
        
        try {
            const currentIdx = this.materialIndex.get(startMaterial);
            if (currentIdx === undefined) {
                return [startMaterial, initialUsage];
            }
            
            const currentRow = this.data[currentIdx];
            const currentLV = currentRow.LV || -1;
            
            if (this.visited.has(startMaterial)) {
                return [startMaterial, initialUsage];
            }
            
            this.visited.add(startMaterial);
            
            try {
                const parentPartNumber = currentRow['Part Number'] || '';
                
                if (currentLV <= 0 || !parentPartNumber || parentPartNumber === '') {
                    return [startMaterial, initialUsage];
                }
                
                const parentMaterial = String(parentPartNumber).trim();
                const parentIdx = this.materialIndex.get(parentMaterial);
                
                if (parentIdx === undefined) {
                    return [startMaterial, initialUsage];
                }
                
                const parentRow = this.data[parentIdx];
                
                let parentUnitUsg = parentRow['Unit Usg'] || 1.0;
                if (isNaN(parentUnitUsg)) {
                    parentUnitUsg = 1.0;
                } else {
                    parentUnitUsg = parseFloat(parentUnitUsg);
                }
                
                const newUsage = initialUsage * parentUnitUsg;
                
                if (this.matchesPattern(parentRow.Material)) {
                    const [_, finalTtlUsage] = this._traverseHierarchyUnified(
                        parentMaterial,
                        newUsage,
                        depth + 1,
                        maxDepth
                    );
                    return [parentRow.Material, finalTtlUsage];
                }
                
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
     * @returns {Array<Object>}
     */
    process() {
        console.log(`\n開始處理 ${this.data.length} 行數據...`);
        
        const sysCpnResults = [];
        const ttlUsageResults = [];
        
        for (let idx = 0; idx < this.data.length; idx++) {
            const row = this.data[idx];
            const currentMaterial = String(row.Material || '');
            const currentLV = row.LV;
            
            let unitUsg = row['Unit Usg'] || 1.0;
            if (isNaN(unitUsg)) {
                unitUsg = 1.0;
            } else {
                unitUsg = parseFloat(unitUsg);
            }
            
            // 步驟1：LV檢查（頂層）
            if (currentLV <= 1) {
                sysCpnResults.push(currentMaterial);
                ttlUsageResults.push(unitUsg);
                continue;
            }
            
            // 步驟1.5：特殊LV規則檢查（支持單個或多個規則）
            if (this._matchesLVSpecialRule(currentLV, currentMaterial)) {
                sysCpnResults.push(currentMaterial);
                
                // 計算Ttl. Usage（向上累乘至LV=0）
                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    currentMaterial,
                    unitUsg
                );
                ttlUsageResults.push(ttlUsage);
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
                sysCpnResults.push(currentMaterial);
                ttlUsageResults.push(unitUsg);
                continue;
            }
            
            this.visited.clear();
            
            const parentMaterialStr = String(currentPartNumber).trim();
            
            if (this.matchesPattern(parentMaterialStr)) {
                sysCpnResults.push(parentMaterialStr);
                
                this.visited.clear();
                const [_, ttlUsage] = this._traverseHierarchyUnified(
                    parentMaterialStr,
                    unitUsg
                );
                ttlUsageResults.push(ttlUsage);
            } else {
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
     * @param {number} limit
     * @returns {Array<Object>}
     */
    getSamples(limit = 20) {
        return this.data
            .filter(row => row.LV > 1 && row.Material !== row.SYS_CPN)
            .slice(0, limit);
    }
}
