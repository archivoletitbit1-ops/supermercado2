/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBasket, 
  Star, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  ChevronRight,
  ShoppingCart,
  Heart,
  AlertTriangle
} from 'lucide-react';

interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  completed: boolean;
}

interface FavoriteItem {
  id: string;
  name: string;
}

type Tab = 'compras' | 'favoritos';

export default function App() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('compras');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateItem, setDuplicateItem] = useState<{ name: string; qty: string } | null>(null);
  
  // Input states
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  
  // Editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');

  // Load from localStorage
  useEffect(() => {
    const savedItems = localStorage.getItem('shopping-list-items');
    const savedFavs = localStorage.getItem('shopping-list-favs');
    if (savedItems) setItems(JSON.parse(savedItems));
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('shopping-list-items', JSON.stringify(items));
    localStorage.setItem('shopping-list-favs', JSON.stringify(favorites));
  }, [items, favorites]);

  const addItem = (name: string, qty: string, force = false) => {
    if (!name.trim()) return;
    
    const isDuplicate = items.some(item => item.name.toLowerCase() === name.trim().toLowerCase());
    
    if (isDuplicate && !force) {
      setDuplicateItem({ name: name.trim(), qty: qty || '1' });
      setShowDuplicateModal(true);
      return;
    }
    
    const newItem: GroceryItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      quantity: qty || '1',
      completed: false
    };

    setItems(prev => [newItem, ...prev]);
    
    // Add to favorites if not exists
    if (!favorites.some(f => f.name.toLowerCase() === name.trim().toLowerCase())) {
      setFavorites(prev => [{ id: crypto.randomUUID(), name: name.trim() }, ...prev]);
    }

    setNewItemName('');
    setNewItemQty('1');
    setDuplicateItem(null);
    setShowDuplicateModal(false);
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const toggleComplete = (id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const deleteFavorite = (id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  const addFromFavorite = (fav: FavoriteItem) => {
    setActiveTab('compras');
    // We pass setTimeout or run immediately?
    // Since activeTab changes state, we can run immediately, React will batch render properly.
    addItem(fav.name, '1');
  };

  const startEditing = (item: GroceryItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQty(item.quantity);
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    setItems(prev => prev.map(item => 
      item.id === editingId ? { ...item, name: editName, quantity: editQty } : item
    ));
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const clearCompletedItems = () => {
    setItems(prev => prev.filter(item => !item.completed));
    setShowConfirmModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-6 shadow-lg sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-xl text-emerald-600">
              <ShoppingBasket size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">SuperLista</h1>
          </div>
          <div className="text-emerald-100 text-xs font-medium uppercase tracking-widest">
            {items.length} Artículos
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {/* Tab Navigation */}
        <div className="flex bg-white rounded-2xl p-1 mb-6 shadow-sm border border-slate-100">
          <button
            onClick={() => setActiveTab('compras')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 ${
              activeTab === 'compras' 
                ? 'bg-emerald-50 text-emerald-700 font-bold shadow-inner' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ShoppingCart size={18} />
            <span>Compras</span>
          </button>
          <button
            onClick={() => setActiveTab('favoritos')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 ${
              activeTab === 'favoritos' 
                ? 'bg-emerald-50 text-emerald-700 font-bold shadow-inner' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Heart size={18} />
            <span>Favoritos</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'compras' ? (
            <motion.div
              key="compras-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Form to add item */}
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Nuevo Artículo</h3>
                <div className="flex gap-2">
                  <div className="flex-[3] relative">
                    <input
                      type="text"
                      placeholder="Ej: Leche..."
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addItem(newItemName, newItemQty)}
                      className="w-full bg-slate-50 border-0 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    />
                  </div>
                  <div className="flex-[1]">
                    <input
                      type="text"
                      placeholder="Cant."
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addItem(newItemName, newItemQty)}
                      className="w-full bg-slate-50 border-0 rounded-2xl p-4 text-center focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    />
                  </div>
                  <button
                    onClick={() => addItem(newItemName, newItemQty)}
                    className="p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200 active:scale-95"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <div className="bg-slate-100 inline-block p-4 rounded-full mb-4">
                      <ShoppingCart size={32} />
                    </div>
                    <p>Tu lista está vacía.</p>
                    <p className="text-sm mt-1">¡Añade algo arriba!</p>
                  </div>
                ) : (
                  items.map((item) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={item.id}
                      className={`bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border transition-colors ${
                        item.completed ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-50'
                      }`}
                    >
                      {editingId === item.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 bg-slate-100 border-0 rounded-xl p-2 outline-none focus:ring-2 focus:ring-emerald-500"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="w-16 bg-slate-100 border-0 rounded-xl p-2 text-center outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <button onClick={saveEdit} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                            <Check size={20} />
                          </button>
                          <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                            <X size={20} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => toggleComplete(item.id)}>
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                              item.completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'
                            }`}>
                              {item.completed && <Check size={14} className="text-white" />}
                            </div>
                            <div className="flex flex-col">
                              <span className={`font-medium text-lg leading-tight transition-all ${
                                item.completed ? 'text-slate-400 line-through' : 'text-slate-800'
                              }`}>
                                {item.name}
                              </span>
                              <span className="text-xs text-slate-400 font-medium">CANTIDAD: {item.quantity}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEditing(item)}
                              className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="favoritos-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid grid-cols-2 gap-3">
                {favorites.length === 0 ? (
                  <div className="col-span-2 text-center py-12 text-slate-400">
                    <div className="bg-slate-100 inline-block p-4 rounded-full mb-4">
                      <Star size={32} />
                    </div>
                    <p>No tienes favoritos todavía.</p>
                    <p className="text-sm mt-1">Se guardan aquí automáticamente al añadirlos.</p>
                  </div>
                ) : (
                  favorites.map((fav) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={fav.id}
                      className="group bg-white rounded-2xl p-4 shadow-sm border border-slate-50 flex items-center justify-between hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div 
                        className="flex-1 pr-8" 
                        onClick={() => addFromFavorite(fav)}
                      >
                        <span className="font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors truncate block">
                          {fav.name}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-1">
                          <span>Añadir</span>
                          <ChevronRight size={10} />
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFavorite(fav.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 text-slate-200 hover:text-rose-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 w-full p-4 pointer-events-none z-30">
        <div className="max-w-md mx-auto flex justify-center">
          <button
            onClick={() => setShowConfirmModal(true)}
            className="pointer-events-auto cursor-pointer bg-rose-50/90 hover:bg-rose-100 active:scale-95 transition-all px-6 py-2.5 rounded-full border border-rose-200/60 text-xs font-bold text-rose-700 uppercase tracking-[0.22em] shadow-md hover:shadow-lg flex items-center gap-2 backdrop-blur-md"
          >
            <Trash2 size={13} />
            Borrar Lista
          </button>
        </div>
      </footer>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center"
            >
              <div className="bg-rose-50 text-rose-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">¿Borrar de la lista?</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                ¿Estás seguro de que deseas borrar solamente los artículos que ya están marcados como comprados? Los demás seguirán en tu lista.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={clearCompletedItems}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all text-sm shadow-md shadow-rose-200 cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate Warning Modal */}
      <AnimatePresence>
        {showDuplicateModal && duplicateItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center"
            >
              <div className="bg-amber-50 text-amber-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">¿Agregar repetido?</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                El artículo <span className="font-semibold text-slate-800">"{duplicateItem.name}"</span> ya existe en tu lista de compras. ¿Deseas agregarlo de todos modos?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setDuplicateItem(null);
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => addItem(duplicateItem.name, duplicateItem.qty, true)}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all text-sm shadow-md shadow-emerald-200 cursor-pointer"
                >
                  Agregar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

