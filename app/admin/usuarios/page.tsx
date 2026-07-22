'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  UserPlus, 
  UserCheck, 
  UserX, 
  Search, 
  Shield, 
  Mail, 
  User as UserIcon,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Palette,
  Image as ImageIcon,
  Save,
  Copy,
  Filter,
  ArrowUpDown,
  Calendar,
  Trash2,
  Pencil,
  AlertCircle,
  Key,
  Clock,
  Phone,
  Eye,
  EyeOff,
  Users
} from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
import { PasswordStrength } from '@/components/PasswordStrength';
import { 
  collection, 
  query, 
  where,
  getDocs,
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  setDoc,
  addDoc,
  limit,
  orderBy,
  or
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
  createUserWithEmailAndPassword, 
  getAuth, 
  signOut
} from 'firebase/auth';
import { uploadFileWithTimeout, getPublicUrl, deleteFile } from '@/lib/storage-service';
import { db } from '@/firebase';
import firebaseConfig from '@/firebase-applet-config.json';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { useRules } from '@/contexts/RuleContext';
import { useToast } from '@/contexts/ToastContext';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';
import { 
  getBrandingSettings,
  saveBrandingSettings,
  handleFirestoreError,
  OperationType
} from '@/lib/data-service';
import { safeLocalStorageSet } from '@/lib/utils';

import { Suspense } from 'react';

function UserSimulationCounter({ userId }: { userId: string }) {
  const [count, setCount] = useState<number | null>(null);
  
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { getCountFromServer, query, collection, where } = await import('firebase/firestore');
        const countSnap = await getCountFromServer(query(collection(db, 'simulations'), where('userId', '==', userId)));
        setCount(countSnap.data().count);
      } catch (e) {
        console.error("Erro ao buscar contagem", e);
      }
    };
    fetchCount();
  }, [userId]);

  if (count === null) return <span className="text-slate-300 text-[10px]">...</span>;
  return <span className="font-bold text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">{count} simulações</span>;
}

export default function UsuariosAdmin() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <UsuariosAdminContent />
    </Suspense>
  );
}

function UsuariosAdminContent() {
  const { profile, setQuotaExceeded } = useAuth();
  const { banks } = useRules();
  const { showToast, hideToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<any[]>([]);

  const formatPhone = (value: string) => {
    let v = value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 6) {
      return `(${v.substring(0, 2)}) ${v.substring(2, 7)}-${v.substring(7)}`;
    } else if (v.length > 2) {
      return `(${v.substring(0, 2)}) ${v.substring(2)}`;
    } else if (v.length > 0) {
      return `(${v}`;
    }
    return v;
  };

  // Handle query params
  useEffect(() => {
    if (searchParams.get('personalizar') === 'true' && profile) {
      if (profile.role === 'admin') {
        setSelectedPromotoraId('admin');
        setShowBranding(true);
      } else if (profile.role === 'promotora') {
        setSelectedPromotoraId(profile.uid);
        setShowBranding(true);
      }
    }
  }, [searchParams, profile]);

  const [loading, setLoading] = useState(true);
  const [usersLimit, setUsersLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [promotoraCreatedCount, setPromotoraCreatedCount] = useState<number | null>(null);
  
  // Branding states
  const [loginImageUrl, setLoginImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#1152d4');
  const [promoterName, setPromoterName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [brandingStatus, setBrandingStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showBranding, setShowBranding] = useState(false);
  const [selectedPromotoraId, setSelectedPromotoraId] = useState<string | null>(null);

  // New user form
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newTrialDays, setNewTrialDays] = useState('7');
  const [newMaxUsers, setNewMaxUsers] = useState('0');
  const [newRole, setNewRole] = useState<UserRole>('corretor');
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newUserUploadProgress, setNewUserUploadProgress] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<{name?: string, email?: string, password?: string}>({});
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  const [editingAllowedBanksUser, setEditingAllowedBanksUser] = useState<any>(null);
  const [showAllowedBanksModal, setShowAllowedBanksModal] = useState(false);
  const [uploadingUserIds, setUploadingUserIds] = useState<Set<string>>(new Set());
  const [updatingUserIds, setUpdatingUserIds] = useState<Set<string>>(new Set());
  const [userUploadProgress, setUserUploadProgress] = useState<Record<string, number>>({});
  const [userToResetPassword, setUserToResetPassword] = useState<any>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Filter and Sort states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [filterPromotora, setFilterPromotora] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Permissions states
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<any>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  // Edit user info states
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('corretor');
  const [editTrialDays, setEditTrialDays] = useState('0');
  const [editMaxUsers, setEditMaxUsers] = useState('0');
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  const AVAILABLE_PERMISSIONS = [
    { id: 'view_reports', label: 'Visualizar Relatórios' },
    { id: 'export_data', label: 'Exportar Dados' },
    { id: 'manage_settings', label: 'Gerenciar Configurações' },
    { id: 'approve_simulations', label: 'Aprovar Simulações' },
  ];

  useEffect(() => {
    if (profile && profile.role !== 'admin' && profile.role !== 'promotora') {
      router.push('/simulacao/nova');
    }
  }, [profile, router]);

  useEffect(() => {
    if (!profile) return;

    const q = profile.role === 'admin' 
      ? query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(usersLimit))
      : query(collection(db, 'users'), or(where('promotoraId', '==', profile.uid), where('createdBy', '==', profile.uid)), orderBy('createdAt', 'desc'), limit(usersLimit));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setHasMore(snapshot.docs.length === usersLimit);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile, usersLimit]);

  useEffect(() => {
    const fetchExactCount = async () => {
      if (profile?.role === 'promotora' && profile.maxUsers !== undefined && profile.maxUsers > 0) {
        try {
          const { getCountFromServer, query, collection, where } = await import('firebase/firestore');
          const countSnap = await getCountFromServer(query(collection(db, 'users'), where('createdBy', '==', profile.uid)));
          setPromotoraCreatedCount(countSnap.data().count);
        } catch (e) {
          console.error("Failed to fetch exact created count", e);
          // Fallback
          setPromotoraCreatedCount(users.filter(u => u.createdBy === profile.uid).length);
        }
      }
    };
    fetchExactCount();
  }, [profile, users]);

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      setLoadingMore(true);
      setUsersLimit(prev => prev + 20);
    }
  };

  useEffect(() => {
    if (!profile) return;
    
    // Default to current user's promotora
    const defaultPromotoraId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
    if (!selectedPromotoraId) {
      setSelectedPromotoraId(defaultPromotoraId);
    }
  }, [profile, selectedPromotoraId]);

  useEffect(() => {
    if (!selectedPromotoraId) return;

    const fetchBranding = async () => {
      try {
        const data = await getBrandingSettings(selectedPromotoraId);
        if (data) {
          setLoginImageUrl(getPublicUrl(data.loginImageUrl) || '');
          setPrimaryColor(data.primaryColor || '#1152d4');
          setPromoterName(data.promoterName || 'Portal do Agente');
          setSlug(data.slug || '');
        } else {
          // Reset if no settings found
          setLoginImageUrl('');
          setPrimaryColor('#1152d4');
          setPromoterName('Portal do Agente');
          setSlug('');
        }
      } catch (error: any) {
        console.error("AdminUsers: Error fetching branding settings:", error);
        if (error.message?.includes('Quota exceeded') || error.message?.includes('resource-exhausted')) {
          setQuotaExceeded(true);
        }
      }
    };

    fetchBranding();
  }, [selectedPromotoraId, setQuotaExceeded]);

  const handleOpenGlobalBranding = () => {
    if (!profile) return;
    
    if (profile.role === 'admin') {
      setSelectedPromotoraId('admin');
    } else if (profile.role === 'promotora') {
      setSelectedPromotoraId(profile.uid);
    }
    setShowBranding(!showBranding);
  };

  // Connection test
  useEffect(() => {
    const testConnection = async () => {
      try {
        // Use a 10-second timeout for the connection test
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Conexão com Firestore expirou")), 10000)
        );
        const getPromise = getDoc(doc(db, 'settings', 'admin'));
        const docSnap = await Promise.race([getPromise, timeoutPromise]) as any;
        console.log("Firestore connection test successful. Document exists:", docSnap?.exists?.() || false);
      } catch (error: any) {
        console.error("Firestore connection test failed:", error);
        if (error.message?.includes('offline') || error.message?.includes('expirou')) {
          setBrandingStatus({ 
            type: 'error', 
            message: "Problema de conexão com o banco de dados. Verifique sua internet." 
          });
        }
      }
    };
    testConnection();
  }, []);

  const handleSaveBranding = async () => {
    let targetId = selectedPromotoraId;
    
    if (!targetId && profile) {
      console.warn("handleSaveBranding: selectedPromotoraId was null, attempting recovery from profile");
      targetId = profile.role === 'admin' ? 'admin' : (profile.role === 'promotora' ? profile.uid : profile.createdBy);
      setSelectedPromotoraId(targetId);
    }

    if (!targetId) {
      console.error("handleSaveBranding: No targetId even after recovery attempt");
      setBrandingStatus({ type: 'error', message: "Erro de identificação. Tente recarregar a página." });
      return;
    }
    
    setIsSavingBranding(true);
    setBrandingStatus(null);
    const loadingToastId = showToast("Salvando configurações...", "loading", 0);
    console.log("handleSaveBranding: Starting save for:", targetId);

    try {
      // Permission check: Admin can save any, Promotora can only save their own
      if (profile?.role !== 'admin' && targetId !== profile?.uid) {
        console.error("handleSaveBranding: Permission denied", profile?.role, targetId);
        throw new Error("Você não tem permissão para personalizar este portal.");
      }

      let finalImageUrl = loginImageUrl;
      
      // Clean slug: lowercase, no spaces, only alphanumeric and hyphens
      const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      
      // Validate slug format
      const slugRegex = /^[a-z0-9-]+$/;
      if (slug && !slugRegex.test(cleanSlug)) {
        throw new Error("O slug da URL contém caracteres inválidos. Use apenas letras minúsculas, números e hífens.");
      }

      // Check if slug is unique (if not empty)
      if (cleanSlug) {
        console.log("handleSaveBranding: Checking slug uniqueness:", cleanSlug);
        const q = query(collection(db, 'settings'), where('slug', '==', cleanSlug));
        
        // Timeout for Firestore query
        const queryPromise = getDocs(q);
        const queryTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout ao verificar slug (10s)")), 10000)
        );
        
        const querySnapshot = await Promise.race([queryPromise, queryTimeoutPromise]) as any;
        
        const isTaken = querySnapshot.docs.some((doc: any) => doc.id !== targetId);
        if (isTaken) {
          console.warn("handleSaveBranding: Slug already taken:", cleanSlug);
          throw new Error("Este slug já está sendo usado por outra promotora. Escolha outro.");
        }
        console.log("handleSaveBranding: Slug is unique");
      }

      if (imageFile) {
        console.log("handleSaveBranding: [STEP 1] Validating image file...", imageFile.name, imageFile.size, imageFile.type);
        
        // Validate file size (max 5MB for branding logo)
        if (imageFile.size > 5 * 1024 * 1024) {
          throw new Error("A logo deve ter no máximo 5MB. Reduza o arquivo ou envie uma imagem menor.");
        }

        if (!imageFile.type.startsWith('image/')) {
          console.error("handleSaveBranding: Invalid file type", imageFile.type);
          throw new Error("O arquivo selecionado não é uma imagem válida.");
        }
        
        let fileToUpload = imageFile;
        // Compress if > 500KB
        if (imageFile.size > 500 * 1024) {
          console.log("handleSaveBranding: Compressing image...");
          fileToUpload = await compressImage(imageFile);
        }

        try {
          // Delete old branding image if exists to save space
          if (loginImageUrl && loginImageUrl.includes('firebasestorage')) {
            try {
              await deleteFile(loginImageUrl);
            } catch (e) {
              console.warn("Could not delete old branding image, continuing", e);
            }
          }

          // Upload image via client-side SDK with a timestamp to avoid cache issues
          const fileExt = fileToUpload.name.split('.').pop() || 'png';
          
          // Save in logos/{uid}/...
          const storagePath = `logos/${profile?.uid}/${Date.now()}.${fileExt}`;
          
          console.log("handleSaveBranding: [STEP 2] Starting uploadFileWithTimeout to:", storagePath);
          setUploadProgress(10); // Initial progress
          
          finalImageUrl = await uploadFileWithTimeout(storagePath, fileToUpload, {
            onProgress: (progress) => {
              console.log(`handleSaveBranding: [UPLOAD PROGRESS] ${progress}%`);
              setUploadProgress(progress);
            },
            timeoutMs: 90000 // 90s timeout
          });
          
          console.log("handleSaveBranding: [STEP 3] Upload successful, URL:", finalImageUrl);
          setLoginImageUrl(getPublicUrl(finalImageUrl));
          setUploadProgress(100);
        } catch (uploadError: any) {
          setUploadProgress(null);
          console.error("handleSaveBranding: [ERROR] Upload failed:", uploadError);
          
          let errorMessage = "Erro no upload da imagem.";
          if (uploadError.message.includes('403') || uploadError.message.includes('unauthorized') || uploadError.message.includes('denied')) {
            errorMessage = "Sem permissão para enviar imagem. Verifique se você está logado.";
          } else if (uploadError.message.includes('Timeout')) {
            errorMessage = "O upload demorou muito. Tente uma imagem menor ou verifique sua conexão.";
          }
          
          throw new Error(errorMessage);
        }
      }

      const brandingData = {
        loginImageUrl: finalImageUrl,
        primaryColor,
        promoterName,
        slug: cleanSlug
      };

      console.log("handleSaveBranding: [STEP 4] Saving settings via DataService for:", targetId);
      await saveBrandingSettings(targetId, brandingData);
      console.log("handleSaveBranding: DataService save successful");

      // Update local cache
      const CACHE_KEY = `branding_${targetId}`;
      safeLocalStorageSet(CACHE_KEY, JSON.stringify({
        data: brandingData,
        timestamp: Date.now()
      }));
      
      // Also strictly clear the slug cache so it reflects immediately
      if (cleanSlug) {
        localStorage.removeItem(`branding_promotora_${cleanSlug}`);
      }

      // Removed automatic reload and global cache update
      console.log("handleSaveBranding: Branding save completed successfully");
      setBrandingStatus({ type: 'success', message: "Configurações salvas!" });
      showToast("Configurações de branding salvas com sucesso!", "success");
      setImageFile(null);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setBrandingStatus(null), 3000);
    } catch (error: any) {
      console.error("handleSaveBranding: Error saving branding:", error);
      const errorMessage = error.message || "Erro ao salvar configurações. Tente novamente.";
      setBrandingStatus({ 
        type: 'error', 
        message: errorMessage
      });
      showToast(errorMessage, "error");
    } finally {
      console.log("handleSaveBranding: Finalizing save process");
      setIsSavingBranding(false);
      hideToast(loadingToastId);
    }
  };

  // Helper to compress image
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error('Canvas is empty'));
          else resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', 0.7);
      };
      img.onerror = reject;
    });
  };

  const logAuditAction = async (action: string, targetId: string, details: string) => {
    if (!profile) return;
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action,
        actorId: profile.uid,
        actorName: profile.name || 'Admin',
        actorRole: profile.role,
        targetId,
        details,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to log audit action:", e);
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role || 'corretor');
    setEditMaxUsers(user.maxUsers?.toString() || '0');
    
    // Calculate trial days from expiresAt if it exists
    if (user.expiresAt) {
      const expiresAt = user.expiresAt.toDate ? user.expiresAt.toDate() : new Date(user.expiresAt);
      const createdAt = user.createdAt?.toDate ? user.createdAt.toDate() : (user.createdAt ? new Date(user.createdAt) : new Date());
      const diffTime = Math.abs(expiresAt.getTime() - createdAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setEditTrialDays(diffDays.toString());
    } else {
      setEditTrialDays('0');
    }
    
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    if (!editName || !editEmail) {
      showToast("Nome e e-mail são obrigatórios.", "error");
      return;
    }

    setIsUpdatingUser(true);
    try {
      // Update email in Firebase Auth if it changed
      if (editEmail !== editingUser.email) {
        const response = await fetch('/api/admin/update-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: editingUser.id,
            newEmail: editEmail,
            adminUid: profile?.uid,
          }),
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Erro ao atualizar e-mail no Firebase Auth.");
        }
      }

      const userRef = doc(db, 'users', editingUser.id);
      
      // Update expiresAt based on trial days
      const days = parseInt(editTrialDays || '0');
      let expiresAt = null;
      if (days > 0) {
        const createdAt = editingUser.createdAt?.toDate ? editingUser.createdAt.toDate() : (editingUser.createdAt ? new Date(editingUser.createdAt) : new Date());
        expiresAt = new Date(createdAt);
        expiresAt.setDate(expiresAt.getDate() + days);
      }

      await updateDoc(userRef, {
        name: editName,
        email: editEmail,
        phone: editPhone,
        role: editRole,
        expiresAt: expiresAt,
        maxUsers: parseInt(editMaxUsers || '0')
      });
      
      await logAuditAction('UPDATE_USER', editingUser.id, `Nome: ${editName}, Email: ${editEmail}, Perfil: ${editRole}`);
      
      showToast("Usuário atualizado com sucesso!", "success");
      setShowEditModal(false);
      setEditingUser(null);
    } catch (error: any) {
      console.error("Error updating user:", error);
      showToast(error.message || "Erro ao atualizar usuário.", "error");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
  };

  const confirmDelete = async () => {
    if (!userToDelete || deleteConfirmationName !== userToDelete.name) {
      showToast("O nome digitado não corresponde.", "error");
      return;
    }
    try {
      // Permission check: Admin can delete any, Promotora can only delete their own created users
      if (profile?.role !== 'admin' && userToDelete.createdBy !== profile?.uid) {
        showToast("Você não tem permissão para excluir este usuário.", "error");
        return;
      }

      // Delete avatar from storage if exists
      const oldAvatarUrl = userToDelete.avatarUrl || userToDelete.photoUrl;
      if (oldAvatarUrl && oldAvatarUrl.includes('firebasestorage')) {
        try {
          await deleteFile(oldAvatarUrl);
        } catch (e) {
          console.warn("Could not delete user avatar during deletion, continuing", e);
        }
      }

      await deleteDoc(doc(db, 'users', userToDelete.id));
      await logAuditAction('DELETE_USER', userToDelete.id, `Nome deletado: ${userToDelete.name}, Email: ${userToDelete.email}`);
      showToast("Usuário excluído com sucesso!", "success");
      setUserToDelete(null);
      setDeleteConfirmationName('');
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast("Erro ao excluir usuário.", "error");
    }
  };

  const handleAvatarUpload = async (user: any, file: File) => {
    // Permission check: Admin can update any, Promotora can only update their own created users, and users can update themselves
    if (profile?.role !== 'admin' && user.createdBy !== profile?.uid && user.id !== profile?.uid) {
      showToast("Você não tem permissão para alterar o avatar deste usuário.", "error");
      return;
    }

    // Increased limit to 1MB to match profile page
    if (file.size > 1024 * 1024) {
      showToast("A imagem deve ter no máximo 1MB.", "error");
      return;
    }

    setUploadingUserIds(prev => new Set(prev).add(user.id));
    setUserUploadProgress(prev => ({ ...prev, [user.id]: 0 }));

    try {
      // Delete old avatar if exists to save space
      const oldAvatarUrl = user.avatarUrl || user.photoUrl;
      if (oldAvatarUrl && oldAvatarUrl.includes('firebasestorage')) {
        try {
          await deleteFile(oldAvatarUrl);
        } catch (e) {
          console.warn("Could not delete old user avatar, continuing", e);
        }
      }

      const fileExt = file.name.split('.').pop() || 'png';
      const storagePath = `avatars/${user.id}.${fileExt}`;
      
      const downloadURL = await uploadFileWithTimeout(storagePath, file, {
        timeoutMs: 60000,
        onProgress: (progress) => {
          setUserUploadProgress(prev => ({ ...prev, [user.id]: progress }));
        }
      });
      
      try {
        await updateDoc(doc(db, 'users', user.id), { 
          avatarUrl: downloadURL,
          photoUrl: downloadURL 
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
      }

      // Update local state immediately for better UX
      console.log("handleAvatarUpload: Updating local state with URL:", downloadURL);
      
      showToast("Avatar atualizado com sucesso!", "success");
    } catch (error: any) {
      console.error("Error updating avatar:", error);
      showToast(`Erro ao atualizar avatar: ${error.message}`, "error");
    } finally {
      setUploadingUserIds(prev => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
      setUserUploadProgress(prev => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
    }
  };

  const handleRemoveAvatar = async (user: any) => {
    if (profile?.role !== 'admin' && user.createdBy !== profile?.uid && user.id !== profile?.uid) {
      showToast("Você não tem permissão para remover o avatar deste usuário.", "error");
      return;
    }

    setUploadingUserIds(prev => new Set(prev).add(user.id));
    try {
      await updateDoc(doc(db, 'users', user.id), {
        avatarUrl: null,
        photoUrl: null
      });
      
      showToast("Avatar removido!", "success");
    } catch (error) {
      console.error("Error removing avatar:", error);
      showToast("Erro ao remover avatar.", "error");
    } finally {
      setUploadingUserIds(prev => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    setUpdatingUserIds(prev => new Set(prev).add(userId));
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: newStatus
      });

      // Recursive blocking for Promotoras
      const user = users.find(u => u.id === userId);
      if (user?.role === 'promotora' && newStatus === 'inactive') {
        const q = query(collection(db, 'users'), where('createdBy', '==', userId));
        const snapshot = await getDocs(q);
        const batch = [];
        snapshot.docs.forEach(d => {
          batch.push(updateDoc(d.ref, { status: 'inactive' }));
        });
        await Promise.all(batch);
      }

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      if (user?.role === 'promotora' && newStatus === 'inactive') {
        // setUsers(prev => prev.map(u => u.createdBy === userId ? { ...u, status: 'inactive' } : u));
      }
      
      await logAuditAction('UPDATE_STATUS', userId, `Novo status: ${newStatus}`);

      showToast("Status atualizado!", "success");
    } catch (error) {
      console.error("Error updating status:", error);
      showToast("Erro ao atualizar status.", "error");
    } finally {
      setUpdatingUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUserIds(prev => new Set(prev).add(userId));
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
      await logAuditAction('UPDATE_ROLE', userId, `Novo perfil: ${newRole}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showToast("Nível de acesso atualizado!", "success");
    } catch (error) {
      console.error("Error updating role:", error);
      showToast("Erro ao atualizar nível de acesso.", "error");
    } finally {
      setUpdatingUserIds(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const handleToggleAutoRenew = async (user: any) => {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        autoRenew: !user.autoRenew
      });
      showToast(`Renovação automática ${!user.autoRenew ? 'ativada' : 'desativada'} com sucesso!`, "success");
    } catch (error) {
      console.error("Erro ao atualizar renovação", error);
      showToast("Erro ao atualizar renovação.", "error");
    }
  };

  const handleMaxUsersChange = async (userId: string, maxUsers: number) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        maxUsers: maxUsers
      });
    } catch (error) {
      console.error("Error updating max users:", error);
    }
  };

  const handleAllowedBanksChange = async (userId: string, allowedBanks: string[]) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        allowedBanks: allowedBanks
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      console.error("Error updating allowed banks:", error);
    }
  };

  const handlePermissionsChange = async (userId: string, permissions: string[]) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        permissions: permissions
      });
      await logAuditAction('UPDATE_PERMISSIONS', userId, `Permissões: ${permissions.join(', ')}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      console.error("Error updating permissions:", error);
    }
  };

  const [isResettingImages, setIsResettingImages] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetAllImages = async () => {
    setIsResettingImages(true);
    setShowResetConfirm(false);
    try {
      const batch = [];
      // Clear user avatars
      for (const user of users) {
        if (user.avatarUrl || user.photoUrl) {
          batch.push(updateDoc(doc(db, 'users', user.id), {
            avatarUrl: null,
            photoUrl: null
          }));
        }
      }
      
      // Clear global branding
      batch.push(setDoc(doc(db, 'settings', 'admin'), {
        loginImageUrl: null
      }, { merge: true }));

      // If current user is a promotora, also clear their own branding
      if (profile?.role === 'promotora') {
        batch.push(setDoc(doc(db, 'settings', profile.uid), {
          loginImageUrl: null
        }, { merge: true }));
      }
      
      await Promise.all(batch);
      
      // Update local state
      setBranding(prev => ({ ...prev, loginImageUrl: null }));
      setPromoterName('Portal do Agente');
      
      showToast("Todas as imagens foram removidas com sucesso!", "success");
    } catch (error) {
      console.error("Error resetting images:", error);
      showToast("Erro ao remover imagens.", "error");
    } finally {
      setIsResettingImages(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToResetPassword || !newPasswordForReset || !profile) return;
    
    const trimmedPassword = newPasswordForReset.trim();
    if (trimmedPassword.length < 6) {
      showToast("A senha deve ter pelo menos 6 caracteres.", "error");
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: userToResetPassword.id,
          newPassword: trimmedPassword,
          adminUid: profile.uid,
        }),
      });

      const data = await response.json();
      if (data.success) {
        showToast("Senha redefinida com sucesso! O usuário já pode fazer login com a nova senha.", "success");
        setUserToResetPassword(null);
        setNewPasswordForReset('');
      } else {
        showToast("Erro ao redefinir senha: " + data.error, "error");
      }
    } catch (error: any) {
      console.error("Error resetting password:", error);
      showToast("Erro ao redefinir senha.", "error");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const getCreatorName = (uid: string | null) => {
    if (!uid) return 'Sistema';
    if (uid === profile?.uid) return profile.name || 'Você';
    const creator = users.find(u => u.uid === uid || u.id === uid);
    return creator?.name || 'Administrador';
  };

  const getDaysRemaining = (user: any) => {
    const baseDate = user.trialResetAt || user.createdAt;
    if (!baseDate) return 30;
    const createdDate = baseDate.toDate ? baseDate.toDate() : new Date(baseDate);
    const now = new Date();
    const diffTime = now.getTime() - createdDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const remaining = 30 - diffDays;
    return remaining > 0 ? remaining : 0;
  };

  const handleToggleExpirationBlock = async (user: any) => {
    if (profile?.role !== 'admin') return;
    
    const remaining = getDaysRemaining(user);
    const isExpired = remaining <= 0;
    const isBlocked = user.status === 'inactive';
    
    if (isBlocked || isExpired) {
      // Unblock
      setUpdatingUserIds(prev => new Set(prev).add(user.id));
      try {
        const newStatus = 'active';
        
        // Update the user themselves
        await updateDoc(doc(db, 'users', user.id), {
          status: newStatus,
          trialResetAt: serverTimestamp()
        });
        
        // If it's a promotora, unblock all her users too
        if (user.role === 'promotora') {
          const q = query(collection(db, 'users'), where('createdBy', '==', user.id));
          const snapshot = await getDocs(q);
          const batch = [];
          snapshot.docs.forEach(d => {
            batch.push(updateDoc(d.ref, { status: newStatus }));
          });
          await Promise.all(batch);
        }
        
        showToast("Usuário e dependentes desbloqueados!", "success");
      } catch (error) {
        console.error("Error unblocking user:", error);
        showToast("Erro ao desbloquear usuário.", "error");
      } finally {
        setUpdatingUserIds(prev => {
          const next = new Set(prev);
          next.delete(user.id);
          return next;
        });
      }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateFieldErrors({});

    // Inline validation
    const errors: {name?: string, email?: string, password?: string} = {};
    const trimmedPassword = newPassword.trim();
    if (!newName.trim()) errors.name = "Nome é obrigatório";
    if (!newEmail.trim()) errors.email = "E-mail é obrigatório";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) errors.email = "E-mail inválido";
    if (!trimmedPassword) errors.password = "Senha é obrigatória";
    else if (trimmedPassword.length < 6) errors.password = "Mínimo 6 caracteres";

    if (Object.keys(errors).length > 0) {
      setCreateFieldErrors(errors);
      return;
    }

    if (profile?.role === 'promotora' && profile.maxUsers !== undefined && profile.maxUsers > 0) {
      try {
        const { getCountFromServer, query, collection, where } = await import('firebase/firestore');
        const countSnap = await getCountFromServer(query(collection(db, 'users'), where('createdBy', '==', profile.uid)));
        const createdUsersCount = countSnap.data().count;
        if (createdUsersCount >= profile.maxUsers) {
          setCreateError(`Limite de usuários atingido. Você pode cadastrar no máximo ${profile.maxUsers} usuários.`);
          return;
        }
      } catch (err) {
        console.error("Erro ao validar limite de usuários:", err);
        // Fallback to local filtering if count fails
        const createdUsersCount = users.filter(u => u.createdBy === profile.uid).length;
        if (createdUsersCount >= profile.maxUsers) {
          setCreateError(`Limite de usuários atingido. Você pode cadastrar no máximo ${profile.maxUsers} usuários.`);
          return;
        }
      }
    }

    setIsCreating(true);
    setNewUserUploadProgress(0);

    // To create a user without signing out the current admin, 
    // we initialize a temporary secondary firebase app.
    const secondaryAppName = `SecondaryApp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, trimmedPassword);
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-in-use') {
          console.log("Email already in use, checking if profile exists...");
          // Try to sign in to see if we can "recover" this partial creation
          try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            userCredential = await signInWithEmailAndPassword(secondaryAuth, newEmail, trimmedPassword);
            console.log("AdminUsers: User existed in Auth but not in DB, successfully linked.");
          } catch (signInError: any) {
            console.error("Failed to sign in to existing auth user:", signInError);
            throw new Error("Este e-mail já está em uso por outro usuário ou a senha está incorreta.");
          }
        } else if (authError.code === 'auth/weak-password') {
          throw new Error("A senha é muito fraca. Use pelo menos 6 caracteres.");
        } else if (authError.code === 'auth/invalid-email') {
          throw new Error("O e-mail fornecido é inválido.");
        } else {
          throw authError;
        }
      }
      
      const newUser = userCredential.user;

      let avatarUrl = '';
      if (newLogoFile) {
        try {
          const fileExt = newLogoFile.name.split('.').pop() || 'png';
          const storagePath = `avatars/${newUser.uid}.${fileExt}`;
          avatarUrl = await uploadFileWithTimeout(storagePath, newLogoFile, {
            timeoutMs: 60000,
            onProgress: (progress) => setNewUserUploadProgress(progress)
          });
        } catch (uploadError: any) {
          console.error("Error uploading new user logo:", uploadError);
          // We don't throw here to allow user creation even if avatar fails
        }
      }

      // Create profile in Firestore
      const trialDaysValue = parseInt(newTrialDays || '7');
      const expiresAt = trialDaysValue > 0 ? new Date() : null;
      if (expiresAt && trialDaysValue > 0) {
        expiresAt.setDate(expiresAt.getDate() + trialDaysValue);
      }

      const userProfileData = {
        uid: newUser.uid,
        email: newEmail,
        name: newName,
        phone: newPhone,
        role: newRole,
        avatarUrl: avatarUrl,
        photoUrl: avatarUrl, // Set both for compatibility
        status: 'active', // Admin created users are active by default
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        createdBy: profile?.uid || null,
        promotoraId: profile?.role === 'promotora' ? profile.uid : (profile?.promotoraId || profile?.createdBy || 'admin'),
        allowedBanks: [],
        maxUsers: parseInt(newMaxUsers || '0'),
        permissions: newRole === 'admin' ? ['*'] : [],
      };

      try {
        await setDoc(doc(db, 'users', newUser.uid), userProfileData);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${newUser.uid}`);
        throw err;
      }

      // Update local state immediately
      const localNewUser = {
        ...userProfileData,
        id: newUser.uid,
        createdAt: { toDate: () => new Date() } // Mock Firestore timestamp for local UI
      };
      setUsers(prev => [localNewUser, ...prev]);

      // If it's a promotora, also create initial settings
      if (newRole === 'promotora') {
        const brandingData = {
          loginImageUrl: avatarUrl,
          primaryColor: '#1152d4',
          promoterName: newName,
          updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, 'settings', newUser.uid), brandingData);
        
        // Update local cache if this is the current promotora (unlikely here but good practice)
        const CACHE_KEY = `branding_${newUser.uid}`;
        safeLocalStorageSet(CACHE_KEY, JSON.stringify(brandingData));
      }

      // Sign out from the secondary app and delete it
      await signOut(secondaryAuth);
      
      await logAuditAction('CREATE_USER', newUser.uid, `Nome: ${newName}, Email: ${newEmail}, Perfil: ${newRole}`);
      
      // Send welcome email
      try {
        await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: newEmail,
            password: newPassword,
            name: newName,
          }),
        });
      } catch (emailError) {
        console.error("Error sending welcome email:", emailError);
        // We don't throw here to allow user creation even if email fails
      }

      setIsAddingUser(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('corretor');
      setNewLogoFile(null);
      setNewUserUploadProgress(null);
      
      showToast('Usuário criado com sucesso!', 'success');
    } catch (error: any) {
      console.error("Error creating user:", error);
      setCreateError(error.message || "Erro ao criar usuário");
    } finally {
      setIsCreating(false);
      // Ensure secondary app is deleted to avoid "app already exists" errors
      try {
        await deleteApp(secondaryApp);
      } catch (e) {
        console.error("Error deleting secondary app:", e);
      }
    }
  };

  const processedUsers = useMemo(() => {
    return users.filter(u => {
      if (!profile) return false;
      
      // Search filter: check name and email
      const matchesSearch = 
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      // Date filter
      if (startDate || endDate) {
        const createdAt = u.createdAt?.toDate ? u.createdAt.toDate() : (u.createdAt ? new Date(u.createdAt) : null);
        if (createdAt) {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (createdAt < start) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (createdAt > end) return false;
          }
        } else if (startDate || endDate) {
          return false; // No date to compare
        }
      }

      // Status filter
      if (statusFilter !== 'all' && u.status !== statusFilter) {
        return false;
      }

      // Promotora specific filter (Admin only)
      if (profile.role === 'admin' && filterPromotora !== 'all') {
        if (u.promotoraId !== filterPromotora && u.createdBy !== filterPromotora) {
          return false;
        }
      }

      // Role visibility filter
      if (profile.role === 'admin') {
        return true; // Admin sees all
      }

      if (profile.role === 'promotora') {
        // Promotora sees only users they created, and only 'vendedor' or 'corretor'
        // AND they must NOT see other Promotoras or Admins
        return u.createdBy === profile.uid && (u.role === 'vendedor' || u.role === 'corretor');
      }

      return false; // Other roles shouldn't be here anyway
    }).sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortBy === 'name') {
        valA = a.name?.toLowerCase() || '';
        valB = b.name?.toLowerCase() || '';
      } else if (sortBy === 'email') {
        valA = a.email?.toLowerCase() || '';
        valB = b.email?.toLowerCase() || '';
      } else if (sortBy === 'createdAt') {
        valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, profile, searchTerm, startDate, endDate, statusFilter, filterPromotora, sortBy, sortOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background-light dark:bg-background-dark">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full md:max-w-none mx-auto max-w-md bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 shadow-2xl">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-10">
        <Link href="/dashboard" className="size-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-bold text-lg">Gerenciar Usuários</h1>
        <div className="flex items-center gap-2">
          {profile?.role === 'admin' && (
            <div className="relative">
              <button 
                onClick={() => setShowResetConfirm(!showResetConfirm)}
                disabled={isResettingImages}
                className="size-10 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 flex items-center justify-center transition-all"
                title="Apagar todas as imagens"
              >
                {isResettingImages ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              </button>
              
              <AnimatePresence>
                {showResetConfirm && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="absolute right-0 top-12 w-64 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[100]"
                  >
                    <p className="text-xs font-bold mb-3 text-slate-600 dark:text-slate-300">Tem certeza que deseja apagar TODAS as fotos de perfil e logos?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleResetAllImages}
                        className="flex-1 bg-red-500 text-white text-[10px] font-bold py-2 rounded-lg hover:bg-red-600"
                      >
                        Sim, Apagar
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold py-2 rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="size-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
            title="Atualizar lista"
          >
            <Loader2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsAddingUser(true)}
            className="size-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20"
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <QuotaAlert />
        
        {/* Promotora User Limit Banner */}
        {profile?.role === 'promotora' && profile.maxUsers !== undefined && profile.maxUsers > 0 && promotoraCreatedCount !== null && (() => {
          const percentage = Math.min(100, Math.round((promotoraCreatedCount / profile.maxUsers) * 100));
          const remaining = Math.max(0, profile.maxUsers - promotoraCreatedCount);
          const isDanger = remaining <= 0;
          const isWarning = remaining > 0 && remaining <= Math.ceil(profile.maxUsers * 0.2);
          
          return (
            <div className="mb-6 bg-blue-500/5 border border-blue-500/20 text-blue-700 dark:text-blue-300 p-4 md:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                <div className="size-10 md:size-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
                </div>
                <div className="flex flex-col flex-1">
                  <p className="font-bold text-sm md:text-base text-slate-800 dark:text-slate-100">Limite de Usuários</p>
                  <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                    Você utilizou <span className="font-bold text-slate-700 dark:text-slate-200">{promotoraCreatedCount}</span> de <span className="font-bold text-slate-700 dark:text-slate-200">{profile.maxUsers}</span> usuários
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col w-full md:w-1/3 min-w-[200px] gap-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className={isDanger ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-emerald-500'}>
                    {percentage}% Utilizado
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Faltam <span className="text-slate-700 dark:text-slate-200">{remaining}</span> usuários
                  </span>
                </div>
                <div className="w-full h-2.5 md:h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      isDanger ? 'bg-gradient-to-r from-red-500 to-red-400' 
                      : isWarning ? 'bg-gradient-to-r from-orange-500 to-orange-400'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Branding Settings Toggle */}
        {(profile?.role === 'admin' || profile?.role === 'promotora') && (
          <>
            <AnimatePresence>
              {brandingStatus && (
                <motion.div 
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  className="fixed top-20 left-4 right-4 z-[100] flex justify-center pointer-events-none"
                >
                  <div className={`pointer-events-auto px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${
                    brandingStatus.type === 'success' 
                      ? 'bg-emerald-500/90 text-white border-emerald-400' 
                      : 'bg-red-500/90 text-white border-red-400'
                  }`}>
                    {brandingStatus.type === 'success' ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <AlertCircle className="w-6 h-6" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{brandingStatus.type === 'success' ? 'Sucesso!' : 'Erro!'}</span>
                      <span className="text-xs opacity-90">{brandingStatus.message}</span>
                    </div>
                    <button 
                      onClick={() => setBrandingStatus(null)}
                      className="ml-4 p-1 hover:bg-white/20 rounded-lg transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {(profile?.role === 'admin' || profile?.role === 'promotora') && (
              <button 
                onClick={handleOpenGlobalBranding}
                className="w-full mb-6 flex items-center justify-between p-4 bg-primary/10 dark:bg-slate-800 border border-primary/20 dark:border-slate-700 rounded-2xl text-primary dark:text-slate-200 font-bold transition-all hover:bg-primary/20 dark:hover:bg-slate-700"
              >
                <div className="flex items-center gap-3">
                  <Palette className="w-5 h-5" />
                  <span>Personalizar Portal</span>
                </div>
                <ChevronRight className={`w-5 h-5 transition-transform ${showBranding ? 'rotate-90' : ''}`} />
              </button>
            )}

            {showBranding && (
              <div className="mb-8 p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm animate-in slide-in-from-top duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    Identidade Visual: <span className="text-slate-500 font-medium">{selectedPromotoraId === 'admin' ? 'Global' : 'Promotora'}</span>
                  </h2>
                  {selectedPromotoraId !== 'admin' && profile?.role === 'admin' && (
                    <button 
                      onClick={() => setSelectedPromotoraId('admin')}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      Voltar para Global
                    </button>
                  )}
                </div>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nome da Promotora</label>
                    <input
                      type="text"
                      value={promoterName}
                      onChange={(e) => setPromoterName(e.target.value)}
                      placeholder="Ex: Lyra Promotora"
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Slug da URL (Ex: minha-promotora)</label>
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] text-slate-400 font-mono">/p/</span>
                      <input
                        type="text"
                        value={slug}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                          setSlug(val);
                        }}
                        placeholder="minha-promotora"
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    {slug && (
                      <p className="text-[10px] text-slate-400 ml-1 mt-1">
                        Seu link será: <span className="text-primary font-bold">{window.location.origin}/p/{slug}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Logo da Promotora</label>
                    
                    <label 
                      htmlFor="logo-upload"
                      className={`relative w-full min-h-[160px] h-auto mb-2 rounded-2xl overflow-hidden border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all group ${
                        brandingStatus?.type === 'success' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5' : 
                        brandingStatus?.type === 'error' ? 'border-red-500 bg-red-50/50 dark:bg-red-500/5' :
                        'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-primary/50 hover:bg-primary/5'
                      }`}
                    >
                      {isSavingBranding && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 animate-in fade-in duration-300">
                          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                          {uploadProgress !== null && (
                            <div className="w-3/4 max-w-[200px] bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden shadow-inner">
                              <motion.div 
                                className="h-full bg-primary shadow-[0_0_10px_rgba(17,82,212,0.5)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                              />
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-primary mt-2 uppercase tracking-widest animate-pulse">
                            {uploadProgress !== null ? `Enviando ${uploadProgress}%` : 'Processando...'}
                          </span>
                        </div>
                      )}

                      {brandingStatus?.type === 'success' && !isSavingBranding && (
                        <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 animate-in zoom-in duration-300">
                          <div className="size-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-2">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Upload Concluído!</span>
                        </div>
                      )}

                      {imageFile || loginImageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={imageFile ? URL.createObjectURL(imageFile) : getPublicUrl(loginImageUrl)} 
                            alt="Preview" 
                            className="w-full h-auto object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ImageIcon className="w-8 h-8 text-white" />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setLoginImageUrl('');
                              setImageFile(null);
                            }}
                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <div className="size-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <ImageIcon className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-bold">Clique para enviar a logo</span>
                          <span className="text-[10px] opacity-60">Formatos: JPG, PNG (máx. 2MB)</span>
                        </div>
                      )}
                      
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setImageFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">URL da Logo (Opcional)</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={loginImageUrl}
                        onChange={(e) => setLoginImageUrl(e.target.value)}
                        placeholder="https://exemplo.com/logo.png"
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <button 
                        onClick={() => {
                          if (loginImageUrl) {
                            navigator.clipboard.writeText(loginImageUrl);
                            showToast("URL copiada!", "success");
                          }
                        }}
                        className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary transition-all active:scale-95"
                        title="Copiar URL"
                        type="button"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Cor Principal (Botões)</label>
                    <div className="flex gap-3 items-center">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="size-10 rounded-lg border-0 p-0 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  {/* Debug Info (Only on error) */}
                  {brandingStatus?.type === 'error' && (
                    <div className="p-2 bg-slate-100 dark:bg-surface-dark rounded-lg border border-slate-200 dark:border-white/10 mb-2">
                      <p className="text-[8px] font-mono text-slate-500 break-all">
                        ID: {selectedPromotoraId} | File: {imageFile?.name} ({Math.round((imageFile?.size || 0) / 1024)}KB)
                      </p>
                    </div>
                  )}

                  <button 
                    onClick={handleSaveBranding}
                    disabled={isSavingBranding}
                    className="w-full bg-primary text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-primary/20"
                  >
                    {isSavingBranding ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {uploadProgress !== null ? `Salvando (${uploadProgress}%)` : 'Salvando...'}
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Salvar Identidade
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="relative">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${searchTerm ? 'text-primary' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Buscar pelo nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-sm"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-xl transition-all ${showFilters ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col gap-4 shadow-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Data Inicial</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <input 
                          type="date" 
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Data Final</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <input 
                          type="date" 
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Status</label>
                      <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="all">Todos</option>
                        <option value="active">Ativo</option>
                        <option value="inactive">Inativo</option>
                        <option value="pending">Pendente</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Ordenar por</label>
                      <div className="flex gap-2">
                        <select 
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="flex-1 bg-slate-50 dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="name">Nome</option>
                          <option value="email">E-mail</option>
                          <option value="createdAt">Data de Criação</option>
                        </select>
                        <button 
                          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          className="p-2 bg-slate-50 dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl text-slate-500 hover:text-primary transition-all"
                        >
                          <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {profile?.role === 'admin' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Filtrar por Promotora</label>
                      <select 
                        value={filterPromotora}
                        onChange={(e) => setFilterPromotora(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="all">Todas as Promotoras</option>
                        {users.filter(u => u.role === 'promotora').map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setStatusFilter('all');
                      setFilterPromotora('all');
                      setSortBy('createdAt');
                      setSortOrder('desc');
                    }}
                    className="text-[10px] font-bold text-slate-400 hover:text-primary uppercase tracking-widest text-center mt-1"
                  >
                    Limpar Filtros
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Users List */}
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {processedUsers.length === 0 && (searchTerm || startDate || endDate) && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="py-12 text-center"
              >
                <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Nenhum usuário encontrado</h3>
                <p className="text-sm text-slate-500">Ajuste seus filtros ou busca para encontrar o que procura.</p>
              </motion.div>
            )}
            {processedUsers.map((user) => (
              <motion.div 
                key={user.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm"
              >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <label className="relative cursor-pointer group">
                    <PromotoraAvatar 
                      logoUrl={user.avatarUrl || user.photoUrl} 
                      name={user.name} 
                      className="size-14 border-2 border-slate-100 dark:border-slate-700 shadow-xl" 
                    />
                    <div className={`absolute inset-0 bg-black/50 rounded-full flex items-center justify-center transition-opacity ${uploadingUserIds.has(user.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {uploadingUserIds.has(user.id) ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                          <span className="text-[8px] text-white font-bold mt-0.5">
                            {userUploadProgress[user.id] !== undefined ? `${userUploadProgress[user.id]}%` : 'Enviando...'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 items-center">
                          <ImageIcon className="w-4 h-4 text-white" />
                          {(user.avatarUrl || user.photoUrl) && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveAvatar(user);
                              }}
                              className="p-1 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                              title="Remover avatar"
                            >
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingUserIds.has(user.id)}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleAvatarUpload(user, e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                  <div>
                    <h3 className="font-bold text-sm">{user.name}</h3>
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {user.email}
                    </p>
                    {user.phone && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {user.phone}
                      </p>
                    )}
                    <div className="flex gap-2 items-center mt-1">
                      <p className="text-[10px] text-slate-400">Criado por: {getCreatorName(user.createdBy)}</p>
                      <UserSimulationCounter userId={user.id} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                    user.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {user.status === 'active' ? 'Ativo' : user.status === 'pending' ? 'Pendente' : 'Inativo'}
                  </div>
                  {(profile?.role === 'admin' || (profile?.role === 'promotora' && user.createdBy === profile.uid)) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-primary hover:text-primary/80 p-1 hover:bg-primary/5 rounded-lg transition-all"
                        title="Editar usuário"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir usuário"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                {profile?.role === 'admin' && (
                  <button
                    onClick={() => {
                      // Always use the user's own ID so branding is applied to the selected profile
                      let promotoraId = user.id;

                      if (user.role === 'admin') {
                        promotoraId = 'admin';
                      }
                      
                      if (promotoraId) {
                        setSelectedPromotoraId(promotoraId);
                        setShowBranding(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      } else {
                        // Fallback to admin if still null
                        setSelectedPromotoraId('admin');
                        setShowBranding(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                  >
                    Personalizar
                  </button>
                )}
                  {(() => {
                    const remaining = getDaysRemaining(user);
                    const isExpired = remaining <= 0;
                    const isBlocked = user.status === 'inactive';
                    const creator = users.find(u => u.id === user.createdBy);
                    const isCreatedByAdmin = creator?.role === 'admin';
                    
                    const shouldShowClock = user.role === 'promotora' || ((user.role === 'corretor' || user.role === 'vendedor') && isCreatedByAdmin);
                    
                    if (!shouldShowClock) return null;

                    return (
                      <button
                        onClick={() => {
                          if (profile?.role === 'admin' && (isExpired || isBlocked)) {
                            handleToggleExpirationBlock(user);
                          } else {
                            showToast(`Faltam ${remaining} dias para a renovação do plano.`, "info");
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                          (isExpired || isBlocked)
                            ? 'bg-red-500 text-white hover:bg-red-600' 
                            : remaining <= 5 
                              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
                              : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                        }`}
                        title={(isExpired || isBlocked) ? "Clique para desbloquear" : "Dias para renovação"}
                      >
                        <Clock className="w-3 h-3" /> 
                        {(isExpired || isBlocked) ? 'Bloqueado' : `${remaining}d`}
                      </button>
                    );
                  })()}
                  
                  {user.role !== 'admin' && (
                    <button
                      onClick={() => handleToggleAutoRenew(user)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        user.autoRenew 
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                      title={user.autoRenew ? "Desativar Renovação Automática" : "Ativar Renovação Automática"}
                    >
                      {user.autoRenew ? 'Renovação Ativa' : 'Renovação Manual'}
                    </button>
                  )}

                  {user.role === 'promotora' && (() => {
                    const createdUsers = users.filter(u => u.promotoraId === user.id).length;
                    const max = user.maxUsers || 0;
                    const percentage = max > 0 ? Math.min(100, Math.round((createdUsers / max) * 100)) : 0;
                    const isFull = max > 0 && createdUsers >= max;
                    
                    return (
                      <div className="flex flex-col gap-1.5 min-w-[120px]">
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-between ${
                          isFull
                            ? 'bg-red-500/10 border-red-500/20 text-red-600' 
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3 h-3" />
                            <span>{createdUsers} / {max || '∞'}</span>
                          </div>
                          {max > 0 && (
                            <span className="text-[10px] opacity-80">{percentage}%</span>
                          )}
                        </div>
                        {max > 0 && (
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-red-500' : 'bg-emerald-500'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    onClick={() => {
                      setEditingAllowedBanksUser(user);
                      setShowAllowedBanksModal(true);
                    }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition-all"
                >
                  Bancos
                </button>
                <button
                  onClick={() => {
                    setEditingPermissionsUser(user);
                    setShowPermissionsModal(true);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition-all flex items-center gap-1"
                >
                  <Shield className="w-3 h-3" /> Permissões
                </button>
                <button
                  onClick={() => setUserToResetPassword(user)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary transition-all flex items-center gap-1"
                >
                  <Key className="w-3 h-3" /> Senha
                </button>
                <div className="relative">
                  <select 
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="w-full bg-slate-50 dark:bg-surface border border-slate-200 dark:border-white/10 rounded-lg py-2 px-3 text-xs focus:outline-none disabled:opacity-50"
                    disabled={
                      updatingUserIds.has(user.id) ||
                      (profile?.role !== 'admin' && (user.role === 'admin' || user.role === 'promotora')) ||
                      (profile?.role === 'promotora' && user.createdBy !== profile.uid)
                    }
                  >
                    <option value="corretor">Corretor</option>
                    <option value="vendedor">Vendedor</option>
                    {profile?.role === 'admin' && (
                      <>
                        <option value="promotora">Promotora</option>
                        <option value="admin">Admin</option>
                      </>
                    )}
                  </select>
                  {updatingUserIds.has(user.id) && (
                    <div className="absolute right-8 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    </div>
                  )}
                </div>

                {user.status !== 'active' ? (
                  <button 
                    onClick={() => handleStatusChange(user.id, 'active')}
                    disabled={
                      (profile?.role !== 'admin' && (user.role === 'admin' || user.role === 'promotora')) ||
                      (profile?.role === 'promotora' && user.createdBy !== profile.uid)
                    }
                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                      ((profile?.role !== 'admin' && (user.role === 'admin' || user.role === 'promotora')) || (profile?.role === 'promotora' && user.createdBy !== profile.uid))
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" /> Liberar
                  </button>
                ) : (
                  <button 
                    onClick={() => handleStatusChange(user.id, 'inactive')}
                    disabled={
                      (profile?.role !== 'admin' && (user.role === 'admin' || user.role === 'promotora')) ||
                      (profile?.role === 'promotora' && user.createdBy !== profile.uid)
                    }
                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                      ((profile?.role !== 'admin' && (user.role === 'admin' || user.role === 'promotora')) || (profile?.role === 'promotora' && user.createdBy !== profile.uid))
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                        : 'bg-slate-100 dark:bg-slate-700 hover:bg-red-500/10 hover:text-red-500 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <UserX className="w-4 h-4" /> Bloquear
                  </button>
                )}
              </div>
              
              {profile?.role === 'admin' && user.role === 'promotora' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Limite de Usuários:</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Sem limite"
                    value={user.maxUsers || ''}
                    onChange={(e) => handleMaxUsersChange(user.id, e.target.value ? parseInt(e.target.value) : 0)}
                    className="w-24 bg-slate-50 dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-lg py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}
            </motion.div>
          ))}
          </AnimatePresence>

          {processedUsers.length === 0 && !searchTerm && !startDate && !endDate && (
            <div className="text-center py-12">
              <UserIcon className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">Nenhum usuário cadastrado.</p>
            </div>
          )}

          {hasMore && (
            <div className="py-6 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Carregando...</span>
                  </>
                ) : (
                  <>
                    <span>Carregar mais usuários</span>
                    <ArrowUpDown className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Add User Modal */}
      {showAllowedBanksModal && editingAllowedBanksUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <h2 className="font-bold text-lg mb-4">Bancos Permitidos: {editingAllowedBanksUser.name}</h2>
            
            <div className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer group">
                <input
                  type="checkbox"
                  checked={banks.length > 0 && (editingAllowedBanksUser.allowedBanks?.length || 0) === banks.length}
                  onChange={(e) => {
                    const allBankIds = e.target.checked ? banks.map(b => b.id) : [];
                    setEditingAllowedBanksUser({ ...editingAllowedBanksUser, allowedBanks: allBankIds });
                  }}
                  className="rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-bold text-primary group-hover:underline">Selecionar Todos os Bancos</span>
              </label>
            </div>

            <div className="max-h-60 overflow-y-auto mb-6">
              {banks.map(bank => (
                <label key={bank.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingAllowedBanksUser.allowedBanks?.includes(bank.id) || false}
                    onChange={(e) => {
                      const newAllowedBanks = e.target.checked
                        ? [...(editingAllowedBanksUser.allowedBanks || []), bank.id]
                        : (editingAllowedBanksUser.allowedBanks || []).filter((id: string) => id !== bank.id);
                      setEditingAllowedBanksUser({ ...editingAllowedBanksUser, allowedBanks: newAllowedBanks });
                    }}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">{bank.name} - {bank.convenio}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAllowedBanksModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold">Cancelar</button>
              <button onClick={() => {
                handleAllowedBanksChange(editingAllowedBanksUser.id, editingAllowedBanksUser.allowedBanks || []);
                setShowAllowedBanksModal(false);
              }} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold">Salvar</button>
            </div>
          </div>
        </div>
      )}
      {showPermissionsModal && editingPermissionsUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <h2 className="font-bold text-lg mb-4">Permissões: {editingPermissionsUser.name}</h2>
            <div className="max-h-60 overflow-y-auto mb-6">
              {AVAILABLE_PERMISSIONS.map(permission => (
                <label key={permission.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPermissionsUser.permissions?.includes(permission.id) || false}
                    onChange={(e) => {
                      const newPermissions = e.target.checked
                        ? [...(editingPermissionsUser.permissions || []), permission.id]
                        : (editingPermissionsUser.permissions || []).filter((id: string) => id !== permission.id);
                      setEditingPermissionsUser({ ...editingPermissionsUser, permissions: newPermissions });
                    }}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">{permission.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPermissionsModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold">Cancelar</button>
              <button onClick={() => {
                handlePermissionsChange(editingPermissionsUser.id, editingPermissionsUser.permissions || []);
                setShowPermissionsModal(false);
              }} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold">Salvar</button>
            </div>
          </div>
        </div>
      )}
      {userToResetPassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-lg">Redefinir Senha</h2>
              <button onClick={() => { setUserToResetPassword(null); setNewPasswordForReset(''); }} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleResetPassword} className="p-6 flex flex-col gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Defina uma nova senha para <strong>{userToResetPassword.name}</strong>.
              </p>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nova Senha</label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={newPasswordForReset}
                    onChange={(e) => setNewPasswordForReset(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button 
                  type="button"
                  onClick={() => { setUserToResetPassword(null); setNewPasswordForReset(''); }} 
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isResettingPassword || !newPasswordForReset}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isResettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Redefinir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <h2 className="font-bold text-lg mb-4">Excluir Usuário</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">Tem certeza que deseja excluir o usuário <strong>{userToDelete.name}</strong>? Esta ação não pode ser desfeita.</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Digite o nome do usuário para confirmar:</p>
            <input
              type="text"
              value={deleteConfirmationName}
              onChange={(e) => setDeleteConfirmationName(e.target.value)}
              placeholder={userToDelete.name}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            <div className="flex gap-3">
              <button onClick={() => { setUserToDelete(null); setDeleteConfirmationName(''); }} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold disabled:opacity-50" disabled={deleteConfirmationName !== userToDelete.name}>Excluir</button>
            </div>
          </div>
        </div>
      )}
      {isAddingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-lg">Novo Usuário</h2>
              <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs text-center">
                  {createError}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nome Completo</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (createFieldErrors.name) setCreateFieldErrors(prev => ({...prev, name: undefined}));
                  }}
                  placeholder="Nome do agente"
                  className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 transition-all ${
                    createFieldErrors.name ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-200 dark:border-slate-700 focus:ring-primary/50'
                  }`}
                />
                {createFieldErrors.name && <span className="text-[10px] font-bold text-red-500 ml-1 uppercase tracking-widest">{createFieldErrors.name}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">E-mail</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (createFieldErrors.email) setCreateFieldErrors(prev => ({...prev, email: undefined}));
                  }}
                  placeholder="agente@empresa.com"
                  className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 transition-all ${
                    createFieldErrors.email ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-200 dark:border-slate-700 focus:ring-primary/50'
                  }`}
                />
                {createFieldErrors.email && <span className="text-[10px] font-bold text-red-500 ml-1 uppercase tracking-widest">{createFieldErrors.email}</span>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Telefone</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Senha Inicial</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (createFieldErrors.password) setCreateFieldErrors(prev => ({...prev, password: undefined}));
                  }}
                  placeholder="••••••••"
                  className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 transition-all ${
                    createFieldErrors.password ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-200 dark:border-slate-700 focus:ring-primary/50'
                  }`}
                />
                {createFieldErrors.password && <span className="text-[10px] font-bold text-red-500 ml-1 uppercase tracking-widest">{createFieldErrors.password}</span>}
                <PasswordStrength password={newPassword} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Logo / Avatar</label>
                <label 
                  htmlFor="new-user-logo"
                  className={`relative w-full h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                    newLogoFile ? 'border-primary/50 bg-primary/5' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-primary/50'
                  }`}
                >
                  {isCreating && newUserUploadProgress !== null && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                      <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
                      <div className="w-2/3 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${newUserUploadProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-primary mt-1">{newUserUploadProgress}%</span>
                    </div>
                  )}

                  {newLogoFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={URL.createObjectURL(newLogoFile)} 
                      alt="Preview" 
                      className="h-full object-contain p-2"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400">
                      <ImageIcon className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-bold">Upload Logo</span>
                    </div>
                  )}
                  <input
                    id="new-user-logo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setNewLogoFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nível de Acesso</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="corretor">Corretor</option>
                  <option value="vendedor">Vendedor</option>
                  {profile?.role === 'admin' && (
                    <>
                      <option value="promotora">Promotora</option>
                      <option value="admin">Administrador</option>
                    </>
                  )}
                </select>
              </div>

              {profile?.role === 'admin' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Dias de Teste</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newTrialDays}
                      onChange={(e) => setNewTrialDays(e.target.value)}
                      placeholder="Ex: 7"
                      min="0"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">Dias</div>
                  </div>
                  <p className="text-[9px] text-slate-400 ml-1 mt-0.5">O acesso será bloqueado após este período.</p>
                </div>
              )}

              {profile?.role === 'admin' && (newRole === 'promotora') && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Limite de Usuários</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newMaxUsers}
                      onChange={(e) => setNewMaxUsers(e.target.value)}
                      placeholder="Ex: 10"
                      min="0"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">Users</div>
                  </div>
                  <p className="text-[9px] text-slate-400 ml-1 mt-0.5">Define quantos usuários esta promotora pode cadastrar.</p>
                </div>
              )}

              <button 
                type="submit"
                disabled={isCreating}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-4 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Cadastrar Usuário</span> <CheckCircle2 className="w-5 h-5" /></>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Editar Usuário</h2>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nome Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">E-mail</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>


              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Telefone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nível de Acesso</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="corretor">Corretor</option>
                  <option value="vendedor">Vendedor</option>
                  {profile?.role === 'admin' && (
                    <>
                      <option value="promotora">Promotora</option>
                      <option value="admin">Administrador</option>
                    </>
                  )}
                </select>
              </div>

              {profile?.role === 'admin' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Dias de Teste</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={editTrialDays}
                      onChange={(e) => setEditTrialDays(e.target.value)}
                      placeholder="Ex: 7"
                      min="0"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">Dias</div>
                  </div>
                  <p className="text-[9px] text-slate-400 ml-1 mt-0.5">Defina 0 para acesso ilimitado.</p>
                </div>
              )}

              {profile?.role === 'admin' && editRole === 'promotora' && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Limite de Usuários</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={editMaxUsers}
                      onChange={(e) => setEditMaxUsers(e.target.value)}
                      placeholder="Ex: 10"
                      min="0"
                      className={`w-full border rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                        (parseInt(editMaxUsers) > 0 && users.filter(u => u.promotoraId === editingUser.id).length >= parseInt(editMaxUsers))
                          ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30 text-red-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase">Users</div>
                  </div>
                  <p className="text-[9px] text-slate-400 ml-1 mt-0.5">
                    {parseInt(editMaxUsers) > 0 && users.filter(u => u.promotoraId === editingUser.id).length >= parseInt(editMaxUsers) 
                      ? "Atenção: Limite atingido ou excedido!" 
                      : "0 = Ilimitado"}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                  }}
                  className="flex-1 py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateUser}
                  disabled={isUpdatingUser}
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isUpdatingUser ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Salvar</span> <Save className="w-5 h-5" /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
