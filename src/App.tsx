/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBasket, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  ChevronRight,
  ShoppingCart,
  Heart,
  AlertTriangle,
  Users,
  Copy,
  CheckCircle,
  RefreshCw,
  Info,
  MoreVertical,
  Menu
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  completed: boolean;
  groupId: string;
  createdAt: string;
}

interface FavoriteItem {
  id: string;
  name: string;
  groupId: string;
  createdAt: string;
}

type Tab = 'compras' | 'favoritos';

// Helper to sanitise group identifiers
const sanitizeGroupId = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, '')
    .slice(0, 40) || 'familiar';
};

const generateSafeId = (): string => {
  return crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, '');
};

export default function App() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('compras');
  
  // Modals status
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateItem, setDuplicateItem] = useState<{ name: string; qty: string } | null>(null);
  
  // Group ID setup
  const [groupId, setGroupId] = useState(() => {
    const saved = localStorage.getItem('shopping-list-group-id');
    return saved ? sanitizeGroupId(saved) : 'familiar';
  });
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupInput, setGroupInput] = useState(groupId);
  const [copiedGroup, setCopiedGroup] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);

  // Authentication & DB Sync status
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isSyncing, setIsSyncing] = useState(true);

  // Input states
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  
  // Editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');

  // Persist group ID to local storage
  useEffect(() => {
    localStorage.setItem('shopping-list-group-id', groupId);
  }, [groupId]);

  // Sync Shopping Items and Favorites in Real-Time
  useEffect(() => {
    if (!isAuthenticated) return;

    setIsSyncing(true);

    const shoppingQuery = query(
      collection(db, 'shopping_items'), 
      where('groupId', '==', groupId)
    );

    const favQuery = query(
      collection(db, 'favorite_items'), 
      where('groupId', '==', groupId)
    );

    // Subscribe to shopping items
    const unsubShopping = onSnapshot(
      shoppingQuery,
      (snapshot) => {
        const fetched: GroceryItem[] = [];
        snapshot.forEach((docSnap) => {
          fetched.push({ id: docSnap.id, ...docSnap.data() } as GroceryItem);
        });
        // Sort by createdAt descending on the client side
        fetched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setItems(fetched);
        setIsSyncing(false);
      },
      (error) => {
        setIsSyncing(false);
        handleFirestoreError(error, OperationType.LIST, 'shopping_items');
      }
    );

    // Subscribe to favorites
    const unsubFavs = onSnapshot(
      favQuery,
      (snapshot) => {
        const fetched: FavoriteItem[] = [];
        snapshot.forEach((docSnap) => {
          fetched.push({ id: docSnap.id, ...docSnap.data() } as FavoriteItem);
        });
        // Sort by createdAt descending
        fetched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setFavorites(fetched);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'favorite_items');
      }
    );

    return () => {
      unsubShopping();
      unsubFavs();
    };
  }, [isAuthenticated, groupId]);

  const changeGroup = (e: FormEvent) => {
    e.preventDefault();
    const clean = sanitizeGroupId(groupInput);
    setGroupId(clean);
    setGroupInput(clean);
    setEditingGroup(false);
  };

  const copyGroupToClipboard = () => {
    navigator.clipboard.writeText(groupId).then(() => {
      setCopiedGroup(true);
      setTimeout(() => setCopiedGroup(false), 2000);
    });
  };

  const addItem = async (name: string, qty: string, force = false) => {
    if (!name.trim() || !isAuthenticated) return;
    
    const isDuplicate = items.some(item => item.name.toLowerCase() === name.trim().toLowerCase());
    
    if (isDuplicate && !force) {
      setDuplicateItem({ name: name.trim(), qty: qty || '1' });
      setShowDuplicateModal(true);
      return;
    }
    
    const safeItemId = generateSafeId();
    const itemPath = `shopping_items/${safeItemId}`;
    
    try {
      // Add shopping item
      await setDoc(doc(db, 'shopping_items', safeItemId), {
        name: name.trim(),
        quantity: qty || '1',
        completed: false,
        groupId,
        createdAt: new Date().toISOString()
      });

      // Add to favorites if not exists
      const favExists = favorites.some(f => f.name.toLowerCase() === name.trim().toLowerCase());
      if (!favExists) {
        const safeFavId = generateSafeId();
        await setDoc(doc(db, 'favorite_items', safeFavId), {
          name: name.trim(),
          groupId,
          createdAt: new Date().toISOString()
        });
      }

      setNewItemName('');
      setNewItemQty('1');
      setDuplicateItem(null);
      setShowDuplicateModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, itemPath);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shopping_items', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `shopping_items/${id}`);
    }
  };

  const toggleComplete = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'shopping_items', id), {
        completed: !item.completed
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `shopping_items/${id}`);
    }
  };

  const deleteFavorite = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'favorite_items', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `favorite_items/${id}`);
    }
  };

  const addFromFavorite = (fav: FavoriteItem) => {
    setActiveTab('compras');
    addItem(fav.name, '1');
  };

  const startEditing = (item: GroceryItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditQty(item.quantity);
  };

  const saveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    try {
      await updateDoc(doc(db, 'shopping_items', editingId), {
        name: editName.trim(),
        quantity: editQty
      });
      setEditingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `shopping_items/${editingId}`);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const clearCompletedItems = async () => {
    const completedItems = items.filter(item => item.completed);
    if (completedItems.length === 0) {
      setShowConfirmModal(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      completedItems.forEach(item => {
        batch.delete(doc(db, 'shopping_items', item.id));
      });
      await batch.commit();
      setShowConfirmModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'shopping_items_batch');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-28">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-6 shadow-lg sticky top-0 z-10 transition-colors">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-xl text-emerald-600">
              <ShoppingBasket size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white leading-none">SuperLista</h1>
              <p className="text-[10px] text-emerald-100 mt-1 uppercase tracking-wider font-semibold">Grupo Sincronizado</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw size={14} className="animate-spin text-emerald-200" />
              ) : (
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                </span>
              )}
              <div className="text-emerald-100 text-xs font-semibold uppercase tracking-widest">
                {items.length} {items.length === 1 ? 'Artículo' : 'Artículos'}
              </div>
            </div>
            
            <button
              onClick={() => setShowGroupPanel(!showGroupPanel)}
              className={`p-2 rounded-xl transition-all duration-300 cursor-pointer ${
                showGroupPanel 
                  ? 'bg-emerald-700/80 text-white font-bold rotate-90 scale-105 shadow-inner' 
                  : 'text-emerald-100 hover:bg-emerald-700/50 hover:text-white'
              }`}
              title="Código de Grupo Compartido"
            >
              <MoreVertical size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Shared Group Selector Section */}
        <AnimatePresence initial={false}>
          {showGroupPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="bg-emerald-50 border border-emerald-100/60 rounded-2xl p-4 shadow-sm flex flex-col gap-3 mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                    <Users size={16} />
                    <span>Código de Grupo Compartido</span>
                  </div>
                  
                  <div className="flex gap-1.5">
                    <button 
                      onClick={copyGroupToClipboard}
                      title="Copiar código del grupo"
                      className="p-1 px-2.5 bg-white text-emerald-700 hover:bg-emerald-100/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all shadow-sm border border-emerald-200 active:scale-95 cursor-pointer pointer-events-auto"
                    >
                      {copiedGroup ? <CheckCircle size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      <span>{copiedGroup ? 'Copiado' : 'Copiar'}</span>
                    </button>
                    
                    {!editingGroup && (
                      <button 
                        onClick={() => setEditingGroup(true)}
                        className="p-1 px-2 text-emerald-800 hover:underline text-xs font-bold cursor-pointer"
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                </div>

                {editingGroup ? (
                  <form onSubmit={changeGroup} className="flex gap-2">
                    <input
                      type="text"
                      value={groupInput}
                      onChange={(e) => setGroupInput(e.target.value)}
                      placeholder="Nombre del grupo (ej: familia-perez)"
                      className="flex-1 bg-white border border-emerald-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-emerald-950"
                      autoFocus
                    />
                    <button 
                      type="submit" 
                      className="bg-emerald-600 text-white rounded-xl px-4 py-2 text-xs font-bold hover:bg-emerald-700 shadow-sm active:scale-95 cursor-pointer"
                    >
                      Unirse
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setEditingGroup(false); setGroupInput(groupId); }}
                      className="bg-slate-200 text-slate-700 rounded-xl px-2.5 py-2 text-xs font-semibold hover:bg-slate-300 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <div className="bg-white rounded-xl px-3 py-2.5 border border-emerald-100 flex items-center justify-between shadow-xs">
                    <span className="font-mono text-emerald-900 font-bold tracking-wide">{groupId}</span>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Info size={10} /> Compartible
                    </span>
                  </div>
                )}

                <p className="text-[11px] text-emerald-800/80 leading-relaxed max-w-sm">
                  Cualquier persona que use el código <strong className="font-mono">{groupId}</strong> podrá ver, agregar y borrar artículos en tiempo real.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation */}
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-slate-100">
          <button
            onClick={() => setActiveTab('compras')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
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
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
              activeTab === 'favoritos' 
                ? 'bg-emerald-50 text-emerald-700 font-bold shadow-inner' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Heart size={18} />
            <span>Favoritos</span>
          </button>
        </div>

        {/* Authentication Fallback spinner */}
        {!isAuthenticated ? (
          <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw size={28} className="animate-spin text-emerald-600" />
            <p className="text-sm font-medium">Conectando con la base de datos compartida...</p>
          </div>
        ) : (
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
                      className="p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200 active:scale-95 cursor-pointer"
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
                      <p className="text-sm mt-1">¡Añade algo arriba o desde Favoritos!</p>
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
                            <button onClick={saveEdit} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer">
                              <Check size={20} />
                            </button>
                            <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg cursor-pointer">
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
                                className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
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
                        <Heart size={32} />
                      </div>
                      <p>No tienes favoritos todavía.</p>
                      <p className="text-sm mt-1">Se guardan aquí automáticamente al añadir artículos nuevos.</p>
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
                          className="absolute top-2 right-2 p-1.5 text-slate-200 hover:text-rose-400 transition-colors cursor-pointer"
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
        )}
      </main>

      {/* Footer Info / Actions */}
      <footer className="fixed bottom-0 left-0 w-full p-4 pointer-events-none z-30">
        <div className="max-w-md mx-auto flex justify-center">
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={items.filter(item => item.completed).length === 0}
            className={`pointer-events-auto cursor-pointer flex items-center gap-2 px-6 py-2.5 rounded-full border text-xs font-bold uppercase tracking-[0.22em] shadow-md hover:shadow-lg transition-all active:scale-95 backdrop-blur-md ${
              items.filter(item => item.completed).length === 0
                ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                : 'bg-rose-50/90 hover:bg-rose-100 border-rose-200/60 text-rose-700'
            }`}
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
