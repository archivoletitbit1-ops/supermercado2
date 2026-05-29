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
  Menu,
  Lock,
  Unlock,
  Key,
  Eye,
  EyeOff,
  Smartphone,
  RotateCw
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
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
  const [favoriteToDelete, setFavoriteToDelete] = useState<FavoriteItem | null>(null);
  const [selectedFavIds, setSelectedFavIds] = useState<string[]>([]);
  
  // Group ID setup
  const [groupId, setGroupId] = useState(() => {
    const saved = localStorage.getItem('shopping-list-group-id');
    return saved ? sanitizeGroupId(saved) : '';
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

  // Group security states
  const [groupData, setGroupData] = useState<{ password?: string; createdAt?: string } | null>(null);
  const [groupLoaded, setGroupLoaded] = useState(false);
  const [unlockedGroups, setUnlockedGroups] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('shopping-list-unlocked');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Access check & control states
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2-field Group joining/registration states
  const [groupPasswordInput, setGroupPasswordInput] = useState('');
  const [showGroupPasswordInput, setShowGroupPasswordInput] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  const [showCreateOption, setShowCreateOption] = useState(false);
  const [isCheckingGroup, setIsCheckingGroup] = useState(false);

  // Secret delete group states
  const [lastTapTime, setLastTapTime] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  // Persist group ID to local storage
  useEffect(() => {
    if (groupId) {
      localStorage.setItem('shopping-list-group-id', groupId);
    }
  }, [groupId]);

  // Check if mobile device is in landscape orientation
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const ua = navigator.userAgent;
      // Regla de agente de usuario para dispositivos móviles (excluyendo tablets estándar)
      const isMobileUA = /Mobi|Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) && !/iPad/i.test(ua);
      
      // Soporte táctil
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      
      // Tamaño de pantalla reducido (móvil). Usamos las dimensiones máximas físicas de pantalla
      // para evitar falsas identificaciones debido al redimensionamiento o rotación.
      const maxScreenDim = Math.max(window.screen.width || 0, window.screen.height || 0);
      const isSmallScreen = maxScreenDim < 1024;
      
      // Excluye expresamente tablets (como iPad o dispositivos con pantalla grande)
      const isMobileDevice = isMobileUA || (isTouch && isSmallScreen && !/iPad|tablet/i.test(ua));
      
      // Monitoreo en tiempo real de la orientación landscape
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      
      setIsMobileLandscape(!!(isMobileDevice && isLandscape));
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Persist unlocked groups passwords
  useEffect(() => {
    localStorage.setItem('shopping-list-unlocked', JSON.stringify(unlockedGroups));
  }, [unlockedGroups]);

  const isGroupUnlocked = !groupData || !groupData.password || unlockedGroups[groupId] === groupData.password;

  // Subscribe to Group Settings/Credentials in Real-Time
  useEffect(() => {
    if (!isAuthenticated || !groupId) {
      setGroupLoaded(true);
      return;
    }
    
    setGroupLoaded(false);
    setPasswordInput('');
    setPasswordError('');
    
    const docRef = doc(db, 'groups', groupId);
    const unsubGroup = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setGroupData(snapshot.data() as { password?: string; createdAt?: string });
        } else {
          setGroupData(null);
        }
        setGroupLoaded(true);
      },
      (error) => {
        setGroupLoaded(true);
        handleFirestoreError(error, OperationType.GET, `groups/${groupId}`);
      }
    );
    
    return () => unsubGroup();
  }, [isAuthenticated, groupId]);

  // Sync Shopping Items and Favorites in Real-Time if group is unlocked
  useEffect(() => {
    if (!isAuthenticated || !isGroupUnlocked) {
      setItems([]);
      setFavorites([]);
      setIsSyncing(false);
      return;
    }

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
        // Sort alphabetically by name on the client side
        fetched.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
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
        // Sort alphabetically by name
        fetched.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
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
  }, [isAuthenticated, groupId, isGroupUnlocked]);

  // Security Helper Actions
  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (!groupData || !groupData.password) return;
    
    if (passwordInput === groupData.password) {
      setUnlockedGroups(prev => ({
        ...prev,
        [groupId]: passwordInput
      }));
      setPasswordError('');
      setPasswordInput('');
    } else {
      setPasswordError('Contraseña incorrecta. Inténtalo de nuevo.');
    }
  };

  const changeGroup = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError('');
    setJoinSuccess('');
    setShowCreateOption(false);
    
    const cleanUser = sanitizeGroupId(groupInput);
    if (!cleanUser || cleanUser === 'familiar') {
      setJoinError('Por favor introduce un nombre de usuario o grupo válido.');
      return;
    }
    
    const plainPassword = groupPasswordInput.trim();
    if (!plainPassword) {
      setJoinError('La contraseña no puede estar vacía.');
      return;
    }
    
    setIsCheckingGroup(true);
    try {
      const docRef = doc(db, 'groups', cleanUser);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        const storedPassword = snap.data().password;
        if (plainPassword === storedPassword) {
          // Correct password! Join group
          setUnlockedGroups(prev => ({
            ...prev,
            [cleanUser]: plainPassword
          }));
          setGroupId(cleanUser);
          setEditingGroup(false);
          setGroupPasswordInput('');
          setJoinSuccess('✓ ¡Conexión con el grupo establecida!');
          setTimeout(() => setJoinSuccess(''), 3000);
          setShowGroupPanel(false);
        } else {
          setJoinError('La contraseña es incorrecta para este usuario/grupo.');
        }
      } else {
        // User/group does not exist! Offer to create it
        setShowCreateOption(true);
        setJoinError(`El usuario "${cleanUser}" no existe.`);
      }
    } catch (err: any) {
      setJoinError('Error al validar el usuario. Inténtalo de nuevo.');
      console.error(err);
    } finally {
      setIsCheckingGroup(false);
    }
  };

  const handleCreateAndJoin = async () => {
    const cleanUser = sanitizeGroupId(groupInput);
    const plainPassword = groupPasswordInput.trim();
    
    if (!cleanUser || !plainPassword) return;
    
    setIsCheckingGroup(true);
    try {
      await setDoc(doc(db, 'groups', cleanUser), {
        password: plainPassword,
        createdAt: new Date().toISOString()
      });
      
      setUnlockedGroups(prev => ({
        ...prev,
        [cleanUser]: plainPassword
      }));
      setGroupId(cleanUser);
      setEditingGroup(false);
      setGroupPasswordInput('');
      setShowCreateOption(false);
      setJoinError('');
      setJoinSuccess('✓ ¡Se ha creado el nuevo usuario con tu contraseña!');
      setTimeout(() => setJoinSuccess(''), 3000);
      setShowGroupPanel(false);
    } catch (err: any) {
      setJoinError('Error al crear el nuevo usuario.');
      console.error(err);
    } finally {
      setIsCheckingGroup(false);
    }
  };

  const handleUsersClick = () => {
    const now = Date.now();
    if (now - lastTapTime < 800) {
      const newCount = tapCount + 1;
      if (newCount >= 3) {
        setDeletePasswordInput('');
        setDeleteError('');
        setShowDeleteGroupModal(true);
        setTapCount(0);
      } else {
        setTapCount(newCount);
      }
    } else {
      setTapCount(1);
    }
    setLastTapTime(now);
  };

  const handleDeleteGroup = async (e: FormEvent) => {
    e.preventDefault();
    setDeleteError('');

    if (!groupId) return;

    if (!groupData || !groupData.password) {
      setDeleteError('No se pudo verificar la contraseña del grupo actual.');
      return;
    }

    if (deletePasswordInput !== groupData.password) {
      setDeleteError('La contraseña introducida es incorrecta.');
      return;
    }

    setIsDeletingGroup(true);
    try {
      const batch = writeBatch(db);

      // Delete items
      items.forEach(item => {
        batch.delete(doc(db, 'shopping_items', item.id));
      });

      // Delete favorites
      favorites.forEach(fav => {
        batch.delete(doc(db, 'favorite_items', fav.id));
      });

      // Delete group
      batch.delete(doc(db, 'groups', groupId));

      await batch.commit();

      // Clear local states
      setUnlockedGroups(prev => {
        const updated = { ...prev };
        delete updated[groupId];
        return updated;
      });

      setGroupId('');
      setGroupInput('');
      setGroupData(null);
      setShowDeleteGroupModal(false);
      setDeletePasswordInput('');
      setShowGroupPanel(false);

      setJoinSuccess('✓ ¡El grupo ha sido eliminado definitivamente!');
      setTimeout(() => setJoinSuccess(''), 4000);
    } catch (err: any) {
      console.error(err);
      setDeleteError('Error al eliminar el grupo de la base de datos.');
    } finally {
      setIsDeletingGroup(false);
    }
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

  const toggleSelectFavorite = (id: string) => {
    setSelectedFavIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addSelectedFavoritesToCompras = async () => {
    if (selectedFavIds.length === 0 || !isAuthenticated) return;

    setIsSyncing(true);
    try {
      const batch = writeBatch(db);
      let itemsAddedCount = 0;
      
      const selectedFavs = favorites.filter(fav => selectedFavIds.includes(fav.id));

      for (const fav of selectedFavs) {
        const isAlreadyAdded = items.some(item => item.name.toLowerCase() === fav.name.toLowerCase() && !item.completed);
        
        if (isAlreadyAdded) {
          continue;
        }

        const safeItemId = generateSafeId();
        batch.set(doc(db, 'shopping_items', safeItemId), {
          name: fav.name.trim(),
          quantity: '1',
          completed: false,
          groupId,
          createdAt: new Date().toISOString()
        });
        itemsAddedCount++;
      }

      if (itemsAddedCount > 0) {
        await batch.commit();
        setJoinSuccess(`✓ ¡Se agregaron ${itemsAddedCount} artículo(s) a la lista!`);
        setTimeout(() => setJoinSuccess(''), 3000);
      } else {
        setJoinSuccess('✓ Los artículos ya estaban en tu lista');
        setTimeout(() => setJoinSuccess(''), 3000);
      }

      setSelectedFavIds([]);
      setActiveTab('compras');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'shopping_items_batch');
    } finally {
      setIsSyncing(false);
    }
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      {/* Forced Portrait View for Mobile in Landscape */}
      <AnimatePresence>
        {isMobileLandscape && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900 text-white z-[9999] flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <motion.div
              animate={{ rotate: [0, -90, -90, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", repeatDelay: 1 }}
              className="mb-8 p-6 bg-emerald-500/10 rounded-3xl border border-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/5 flex items-center justify-center"
            >
              <Smartphone size={54} className="rotate-90" />
            </motion.div>
            <h2 className="text-xl font-extrabold tracking-tight mb-3 text-white">Modo vertical requerido</h2>
            <p className="text-slate-400 text-sm max-w-xs leading-relaxed px-4">
              Para usar la aplicación de forma óptima, gira tu dispositivo a la posición <strong className="text-emerald-400">vertical (portrait)</strong>.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="bg-emerald-600 text-white p-6 shadow-lg sticky top-0 z-10 transition-colors">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-xl text-emerald-600">
              <ShoppingBasket size={24} />
            </div>
            <div className="flex flex-col items-start justify-center">
              <h1 className="text-2xl font-bold tracking-tight text-white leading-none">SuperLista</h1>
              {groupId && (
                <p className="text-[10px] text-emerald-100 mt-1.5 uppercase tracking-wider font-semibold font-mono">
                  {groupId}
                </p>
              )}
            </div>
          </div>
          {groupId && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                {isSyncing ? (
                  <RefreshCw size={13} className="animate-spin text-emerald-200 shrink-0" />
                ) : (
                  <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                )}
                <div className="flex flex-col items-center">
                  <span id="header-items-count" className="text-base font-extrabold text-white leading-none">
                    {items.length}
                  </span>
                  <span className="text-[9px] text-emerald-100 font-bold uppercase tracking-wider mt-0.5 leading-none text-center">
                    {items.length === 1 ? 'Artículo' : 'Artículos'}
                  </span>
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
          )}
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
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4 mb-2">
                {/* Cabecera del Panel */}
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
                  <button
                    type="button"
                    onClick={handleUsersClick}
                    className="text-emerald-600 hover:scale-110 active:scale-95 transition-all focus:outline-none cursor-pointer p-0"
                    title="Control de grupo"
                  >
                    <Users size={18} />
                  </button>
                  <span className="text-slate-700 font-semibold text-xs ml-0.5">
                    Grupo actual: <strong className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100/50 text-xs">{groupId}</strong>
                  </span>
                </div>



                {/* Mensajes de Éxito / Feedback */}
                {joinSuccess && (
                  <div className="text-xs text-center p-3 rounded-xl bg-emerald-50 text-emerald-800 font-semibold border border-emerald-100 animate-pulse">
                    {joinSuccess}
                  </div>
                )}

                {/* Formulario Unificado para Conectar o Registrar */}
                <form onSubmit={changeGroup} className="space-y-3.5 pt-1">
                  <p className="text-xs font-bold text-slate-700">Cambiar de Grupo o Registrarse</p>
                  
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Usuario / Grupo:</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={groupInput}
                        onChange={(e) => {
                          setGroupInput(e.target.value);
                          setJoinError('');
                          setShowCreateOption(false);
                        }}
                        placeholder="Ej: familia-gomez"
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 font-medium placeholder-slate-400"
                        disabled={isCheckingGroup}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contraseña:</label>
                    <div className="relative">
                      <input
                        type={showGroupPasswordInput ? "text" : "password"}
                        value={groupPasswordInput}
                        onChange={(e) => {
                          setGroupPasswordInput(e.target.value);
                          setJoinError('');
                          setShowCreateOption(false);
                        }}
                        placeholder="Contraseña del grupo..."
                        className="w-full bg-slate-50/80 border border-slate-200 rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 font-medium placeholder-slate-400 pr-10"
                        disabled={isCheckingGroup}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGroupPasswordInput(!showGroupPasswordInput)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showGroupPasswordInput ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {joinError && !showCreateOption && (
                    <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-3 rounded-xl border border-rose-100/50">
                      {joinError}
                    </div>
                  )}

                  {/* Crear nuevo usuario si no existe */}
                  {showCreateOption && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                        ⚠️ El usuario <strong className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">"{groupInput}"</strong> no existe en la aplicación. ¿Deseas crear un nuevo usuario con la contraseña elegida?
                      </p>
                      <button
                        type="button"
                        onClick={handleCreateAndJoin}
                        disabled={isCheckingGroup}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Plus size={14} />
                        <span>Sí, crear nuevo usuario e ingresar</span>
                      </button>
                    </div>
                  )}

                  <div className="pt-2">
                    <button 
                      type="submit" 
                      disabled={isCheckingGroup}
                      className="w-full bg-emerald-600 text-white rounded-2xl py-3 text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-100 active:scale-95 disabled:opacity-50 cursor-pointer text-center flex items-center justify-center gap-2 transition-all"
                    >
                      {isCheckingGroup ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Verificando usuario...</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={14} />
                          <span>Ingresar al Grupo</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed max-w-sm mx-auto">
                  Cualquier persona con el usuario y contraseña correctas podrá sincronizar e ingresar al grupo en tiempo real.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation */}
        {groupId && (
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
        )}

        {/* Authentication Fallback spinner */}
        {!isAuthenticated ? (
          <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw size={28} className="animate-spin text-emerald-600" />
            <p className="text-sm font-medium">Conectando con la base de datos compartida...</p>
          </div>
        ) : !groupId ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center space-y-6"
          >
            <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-inner animate-bounce">
              <ShoppingBasket size={32} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800">Bienvenido a SuperLista</h2>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
                Para comenzar, ingresa un nombre de usuario o grupo y tu contraseña de seguridad.
              </p>
            </div>

            {/* Mensajes de Éxito / Feedback */}
            {joinSuccess && (
              <div className="text-xs text-center p-3 rounded-xl bg-emerald-50 text-emerald-800 font-semibold border border-emerald-100 animate-pulse">
                {joinSuccess}
              </div>
            )}

            <form onSubmit={changeGroup} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Usuario / Grupo:</label>
                <input
                  type="text"
                  value={groupInput}
                  onChange={(e) => {
                    setGroupInput(e.target.value);
                    setJoinError('');
                    setShowCreateOption(false);
                  }}
                  placeholder="Ej: familia-gomez"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 font-medium placeholder-slate-400"
                  disabled={isCheckingGroup}
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contraseña de acceso:</label>
                <div className="relative">
                  <input
                    type={showGroupPasswordInput ? "text" : "password"}
                    value={groupPasswordInput}
                    onChange={(e) => {
                      setGroupPasswordInput(e.target.value);
                      setJoinError('');
                      setShowCreateOption(false);
                    }}
                    placeholder="Contraseña del grupo..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 font-medium placeholder-slate-400 pr-12"
                    disabled={isCheckingGroup}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroupPasswordInput(!showGroupPasswordInput)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-all"
                  >
                    {showGroupPasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {joinError && !showCreateOption && (
                <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-3 rounded-xl border border-rose-100/50">
                  {joinError}
                </div>
              )}

              {/* Crear nuevo usuario si no existe */}
              {showCreateOption && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                    ⚠️ El usuario <strong className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">"{groupInput}"</strong> no existe. ¿Deseas crear un nuevo usuario con la contraseña elegida?
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateAndJoin}
                    disabled={isCheckingGroup}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Sí, crear nuevo usuario e ingresar</span>
                  </button>
                </div>
              )}

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isCheckingGroup}
                  className="w-full bg-emerald-600 text-white rounded-2xl py-4 text-xs font-bold uppercase tracking-[0.22em] hover:bg-emerald-700 shadow-md shadow-emerald-100 active:scale-95 disabled:opacity-50 cursor-pointer text-center flex items-center justify-center gap-2 transition-all"
                >
                  {isCheckingGroup ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Verificando grupo...</span>
                    </>
                  ) : (
                    <>
                      <Unlock size={14} />
                      <span>Ingresar al Grupo</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <p className="text-[10px] text-slate-400 text-center leading-relaxed max-w-sm mx-auto">
              Cualquier persona con el usuario y contraseña correctos podrá sincronizar e ingresar al grupo en tiempo real.
            </p>
          </motion.div>
        ) : !groupLoaded ? (
          <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw size={28} className="animate-spin text-emerald-600" />
            <p className="text-sm font-medium">Cargando la seguridad del grupo...</p>
          </div>
        ) : !isGroupUnlocked ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center space-y-6"
          >
            <div className="bg-amber-50 text-amber-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Lock size={32} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800">Grupo Protegido</h2>
              <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
                El grupo <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">"{groupId}"</span> requiere una contraseña de seguridad para poder ver, agregar o editar los artículos.
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Introduce la contraseña del grupo..."
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full bg-slate-50 border-0 rounded-2xl p-4 pr-12 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-medium text-slate-800 placeholder-slate-400 text-center"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-all pointer-events-auto"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {passwordError && (
                <p className="text-xs text-rose-500 font-semibold bg-rose-50 p-2.5 rounded-xl border border-rose-100 animate-pulse">
                  {passwordError}
                </p>
              )}

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold transition-all text-sm shadow-md shadow-emerald-200 cursor-pointer pointer-events-auto flex items-center justify-center gap-2"
                >
                  <Unlock size={16} />
                  Desbloquear y Ver Lista
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setGroupId('familiar');
                    setGroupInput('familiar');
                    setEditingGroup(false);
                    setPasswordInput('');
                    setPasswordError('');
                  }}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-semibold transition-all text-sm cursor-pointer pointer-events-auto"
                >
                  Volver al Grupo Familiar
                </button>
              </div>
            </form>
          </motion.div>
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
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value.replace(/[^0-9]/g, ''))}
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
                                }}`}>
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

                {/* Borrar lista (artículos comprados) de la pestaña Compras */}
                {items.length > 0 && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setShowConfirmModal(true)}
                      disabled={items.filter(item => item.completed).length === 0}
                      className={`w-full py-3.5 px-6 rounded-2xl border text-xs font-bold uppercase tracking-[0.22em] shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                        items.filter(item => item.completed).length === 0
                          ? 'bg-slate-100/80 text-slate-400 border-slate-200/60 opacity-60 cursor-not-allowed'
                          : 'bg-rose-50 hover:bg-rose-100 border-rose-200/60 text-rose-700 cursor-pointer'
                      }`}
                    >
                      <Trash2 size={13} />
                      Borrar Lista
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="favoritos-tab"
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
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Cant."
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(e.target.value.replace(/[^0-9]/g, ''))}
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
                    favorites.map((fav) => {
                      const isSelected = selectedFavIds.includes(fav.id);
                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          key={fav.id}
                          onClick={() => toggleSelectFavorite(fav.id)}
                          className={`group bg-white rounded-2xl p-4 shadow-sm border flex items-center justify-between hover:shadow-md transition-all cursor-pointer relative overflow-hidden select-none ${
                            isSelected 
                              ? 'border-emerald-500 bg-emerald-50/10 shadow-emerald-50/50' 
                              : 'border-slate-100 hover:border-emerald-200'
                          }`}
                        >
                          <div className="flex-1 pr-6 flex items-center gap-2.5 min-w-0">
                            {/* Checkmark indicator */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              isSelected 
                                ? 'bg-emerald-500 border-emerald-500 scale-105' 
                                : 'border-slate-300 group-hover:border-emerald-400'
                            }`}>
                              {isSelected && <Check size={11} className="text-white font-extrabold" />}
                            </div>
                            
                            <div className="min-w-0 flex-1">
                              <span className={`font-semibold text-sm transition-colors truncate block ${
                                isSelected ? 'text-emerald-900 font-bold' : 'text-slate-800'
                              }`}>
                                {fav.name}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavoriteToDelete(fav);
                            }}
                            className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer z-10"
                          >
                            <Trash2 size={13} />
                          </button>
                        </motion.div>
                      );
                    })
                  )}
                </div>

                {/* Bottom bulk actions */}
                {favorites.length > 0 && (
                  <div className="mt-6 space-y-3 pt-2">
                    <div className="flex justify-between items-center px-1 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                      <span>{selectedFavIds.length} {selectedFavIds.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
                      <div className="flex gap-4">
                        {selectedFavIds.length < favorites.length ? (
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFavIds(favorites.map(f => f.id));
                            }}
                            className="text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                          >
                            Seleccionar todo
                          </button>
                        ) : (
                          <button 
                            type="button" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFavIds([]);
                            }}
                            className="text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                          >
                            Deseleccionar todo
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={addSelectedFavoritesToCompras}
                      disabled={selectedFavIds.length === 0}
                      className={`w-full py-4 px-6 rounded-2xl border text-xs font-extrabold uppercase tracking-[0.22em] shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                        selectedFavIds.length === 0
                          ? 'bg-slate-100/80 text-slate-400 border-slate-200/60 opacity-60 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500/10 cursor-pointer shadow-md shadow-emerald-100'
                      }`}
                    >
                      <Plus size={14} />
                      Agregar {selectedFavIds.length > 0 ? `(${selectedFavIds.length})` : ''} to Compras
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Footer Info / Actions removed to use integration page button inside Compras tab */}

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
                Se borrarán solamente los artículos que ya están marcados como comprados, los demás seguirán en tu lista.
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

      {/* Confirmation Modal for Deleting Favorites */}
      <AnimatePresence>
        {favoriteToDelete && (
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
              <h3 className="text-lg font-bold text-slate-800 mb-2">¿Quitar de favoritos?</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                ¿Estás seguro de que deseas eliminar <span className="font-semibold text-slate-800">"{favoriteToDelete.name}"</span> de tu lista de favoritos?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFavoriteToDelete(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteFavorite(favoriteToDelete.id);
                    setFavoriteToDelete(null);
                  }}
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

      {/* Confirmation Modal for Deleting Group */}
      <AnimatePresence>
        {showDeleteGroupModal && (
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
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-left"
            >
              <div className="bg-rose-50 text-rose-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} className="animate-bounce" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 text-center mb-2">¿Eliminar grupo por completo?</h3>
              <p className="text-xs text-rose-600 font-bold bg-rose-50 border border-rose-100 p-3 rounded-2xl mb-4 leading-relaxed text-center">
                ⚠️ ¡ADVERTENCIA!: Esta acción borrará permanentemente el grupo "{groupId}", todos sus artículos y favoritos. ¡ESTA ACCIÓN NO PUEDE SER REVERTIDA!
              </p>
              
              <form onSubmit={handleDeleteGroup} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Introduce la contraseña del grupo para confirmar:
                  </label>
                  <div className="relative">
                    <input
                      type={showDeletePassword ? "text" : "password"}
                      value={deletePasswordInput}
                      onChange={(e) => {
                        setDeletePasswordInput(e.target.value);
                        setDeleteError('');
                      }}
                      placeholder="Contraseña..."
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 font-medium placeholder-slate-400 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showDeletePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {deleteError && (
                  <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-3 rounded-xl border border-rose-100/50 text-center">
                    {deleteError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteGroupModal(false);
                      setDeletePasswordInput('');
                      setDeleteError('');
                    }}
                    disabled={isDeletingGroup}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all text-sm cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingGroup}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all text-sm shadow-md shadow-rose-200 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 animate-pulse"
                  >
                    {isDeletingGroup ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Borrando...</span>
                      </>
                    ) : (
                      <span>Eliminar</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
