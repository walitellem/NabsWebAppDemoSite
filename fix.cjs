const fs = require('fs');
const content = fs.readFileSync('src/components/ReceptionistDashboard.tsx', 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(l => l.includes('Record Sale (GH₵ {drinkCart.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)})'));
const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('<form onSubmit={handleEditDrinkSaleSubmit} className="space-y-4">'));

// The extra duplicated lines happen after endIndex too, let's find the LAST one.
let lastFormIndex = -1;
for(let i = startIndex; i < startIndex + 150; i++) {
    if(lines[i] && lines[i].includes('<form onSubmit={handleEditDrinkSaleSubmit} className="space-y-4">')) {
        lastFormIndex = i;
    }
}

const replacement = `                    Record Sale (GH₵ {drinkCart.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)})
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- EDIT DRINK SALE MODAL --- */}
      <AnimatePresence mode="wait">
        {showEditDrinkSaleModal && saleToEdit && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm"
            onClick={() => setShowEditDrinkSaleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className={\`border rounded-3xl p-6 w-full max-w-md shadow-2xl relative \${theme.tableContainer} max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent cursor-default\`}
            >
              <div className="absolute top-5 right-5 flex items-center gap-2">
                <div className="flex items-center bg-zinc-800/50 rounded-lg p-0.5 border border-zinc-700/50">
                  <button
                    type="button"
                    disabled={!hasPrevSale}
                    onClick={() => handleOpenEditDrinkSale(editableShiftDrinkSales[currentSaleIndex + 1])}
                    className={\`p-1.5 rounded-md transition-all \${hasPrevSale ? 'hover:bg-zinc-700 text-zinc-300' : 'text-zinc-600 opacity-30 cursor-not-allowed'}\`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="w-[1px] h-3 bg-zinc-700 mx-1" />
                  <button
                    type="button"
                    disabled={!hasNextSale}
                    onClick={() => handleOpenEditDrinkSale(editableShiftDrinkSales[currentSaleIndex - 1])}
                    className={\`p-1.5 rounded-md transition-all \${hasNextSale ? 'hover:bg-zinc-700 text-zinc-300' : 'text-zinc-600 opacity-30 cursor-not-allowed'}\`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditDrinkSaleModal(false)}
                  className={\`p-1.5 rounded-lg transition-all cursor-pointer \${isDarkMode ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-slate-100 text-slate-500'}\`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-6 select-none cursor-grab active:cursor-grabbing">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={\`text-lg font-bold \${isDarkMode ? 'text-white' : 'text-slate-900'}\`}>
                    Edit Drink Sale
                  </h3>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">
                    {saleToEdit.serialNumber || saleToEdit.id.slice(0, 8)} • {currentSaleIndex + 1} of {editableShiftDrinkSales.length}
                  </p>
                </div>
              </div>

              <form onSubmit={handleEditDrinkSaleSubmit} className="space-y-4">`;

lines.splice(startIndex, lastFormIndex - startIndex + 1, replacement);
fs.writeFileSync('src/components/ReceptionistDashboard.tsx', lines.join('\n'));
