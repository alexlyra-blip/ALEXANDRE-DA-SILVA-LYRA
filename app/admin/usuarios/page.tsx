'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  Clock,
  Palette,
  Image as ImageIcon,
  Save,
  Copy,
  Filter,
  ArrowUpDown,
  Calendar,
  Trash2,
  AlertCircle,
  Key
} from 'lucide-react';
import { QuotaAlert } from '@/components/QuotaAlert';
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
  limit,
  orderBy,
  startAfter
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  getAuth, 
  deleteUser,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { uploadFileWithTimeout, uploadFileViaApi } from '@/lib/storage-service';
import { initializeApp } from 'firebase/app';
import { db, auth, storage } from '@/firebase';
import firebaseConfig from '@/firebase-applet-config.json';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { useRules } from '@/contexts/RuleContext';
import { PromotoraAvatar } from '@/components/PromotoraAvatar';
import { saveBrandingSettings } from '@/lib/data-service';

export default function UsuariosAdmin() {
  const { profile, setQuotaExceeded } = useAuth();
  const { banks } = useRules();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLimit, setUsersLimit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  
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
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('corretor');
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  const [editingAllowedBanksUser, setEditingAllowedBanksUser] = useState<any>(null);
  const [showAllowedBanksModal, setShowAllowedBanksModal] = useState(false);
  const [uploadingUserIds, setUploadingUserIds] = useState<Set<string>>(new Set());
  const [userUploadProgress, setUserUploadProgress] = useState<Record<string, number>>({});
  const [userToResetPassword, setUserToResetPassword] = useState<any>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Filter and Sort states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Permissions states
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<any>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

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
    setLoading(true);
    const q = query(
      collection(db, 'users'), 
      orderBy('createdAt', 'desc'),
      limit(usersLimit)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersData);
      setHasMore(snapshot.docs.length === usersLimit);
      setLoading(false);
      setLoadingMore(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
        setQuotaExceeded(true);
      }
      setLoading(false);
      setLoadingMore(false);
    });

    return () => unsubscribe();
  }, [setQuotaExceeded, usersLimit]);

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
  }, [profile]);

  useEffect(() => {
    if (!selectedPromotoraId) return;

    const fetchBranding = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', selectedPromotoraId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLoginImageUrl(data.loginImageUrl || '');
          setPrimaryColor(data.primaryColor || '#1152d4');
          setPromoterName(data.promoterName || '');
          setSlug(data.slug || '');
        } else {
          // Reset if no settings found
          setLoginImageUrl('');
          setPrimaryColor('#1152d4');
          setPromoterName('');
          setSlug('');
        }
      } catch (error: any) {
        console.error("AdminUsers: Error fetching branding settings:", error);
        if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
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
    console.log("handleSaveBranding: Starting save for:", targetId);

    try {
      // Permission check: Admin can save any, Promotora can only save their own
      if (profile?.role !== 'admin' && profile?.uid !== targetId) {
        console.error("handleSaveBranding: Permission denied", profile?.role, profile?.uid, targetId);
        throw new Error("Você não tem permissão para personalizar esta promotora.");
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
          // Upload image via client-side SDK with a timestamp to avoid cache issues
          const fileExt = fileToUpload.name.split('.').pop() || 'png';
          
          // Save in logos/{uid}/...
          const storagePath = `logos/${profile?.uid}/${Date.now()}.${fileExt}`;
          
          console.log("handleSaveBranding: [STEP 2] Starting uploadFileViaApi to:", storagePath);
          setUploadProgress(10); // Initial progress
          
          finalImageUrl = await uploadFileViaApi(storagePath, fileToUpload, {
            onProgress: (progress) => {
              console.log(`handleSaveBranding: [UPLOAD PROGRESS] ${progress}%`);
              setUploadProgress(progress);
            },
            timeoutMs: 90000 // 90s timeout
          });
          
          console.log("handleSaveBranding: [STEP 3] Upload successful, URL:", finalImageUrl);
          setLoginImageUrl(finalImageUrl);
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

      console.log("handleSaveBranding: [STEP 4] Saving settings via DataService for:", targetId);
      await saveBrandingSettings(targetId, {
        loginImageUrl: finalImageUrl,
        primaryColor,
        promoterName,
        slug: cleanSlug
      });
      console.log("handleSaveBranding: DataService save successful");

      // Also update the promoter's user avatar if it's a specific promoter
      if (targetId !== 'admin') {
        console.log("handleSaveBranding: Updating promoter user document with new avatar for UID:", targetId);
        const userRef = doc(db, 'users', targetId);
        
        // Timeout for Firestore update
        const updatePromise = updateDoc(userRef, {
          avatarUrl: finalImageUrl,
          photoUrl: finalImageUrl // Set both for compatibility
        });
        const updateTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout ao atualizar perfil (10s)")), 10000)
        );
        
        await Promise.race([updatePromise, updateTimeoutPromise]);
        console.log("handleSaveBranding: User document updated successfully");
      }

      console.log("handleSaveBranding: Branding save completed successfully");
      setBrandingStatus({ type: 'success', message: "Configurações salvas!" });
      setImageFile(null);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setBrandingStatus(null), 3000);
    } catch (error: any) {
      console.error("handleSaveBranding: Error saving branding:", error);
      setBrandingStatus({ 
        type: 'error', 
        message: error.message || "Erro ao salvar configurações. Tente novamente." 
      });
    } finally {
      console.log("handleSaveBranding: Finalizing save process");
      setIsSavingBranding(false);
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

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
  };

  const confirmDelete = async () => {
    if (!userToDelete || deleteConfirmationName !== userToDelete.name) {
      alert("O nome digitado não corresponde.");
      return;
    }
    try {
      // Permission check: Admin can delete any, Promotora can only delete their own created users
      if (profile?.role !== 'admin' && userToDelete.createdBy !== profile?.uid) {
        alert("Você não tem permissão para excluir este usuário.");
        return;
      }

      await deleteDoc(doc(db, 'users', userToDelete.id));
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      alert("Usuário excluído com sucesso!");
      setUserToDelete(null);
      setDeleteConfirmationName('');
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Erro ao excluir usuário.");
    }
  };

  const handleAvatarUpload = async (user: any, file: File) => {
    // Permission check: Admin can update any, Promotora can only update their own created users
    if (profile?.role !== 'admin' && user.createdBy !== profile?.uid) {
      alert("Você não tem permissão para alterar o avatar deste usuário.");
      return;
    }

    if (file.size > 500 * 1024) {
      alert("A imagem deve ter no máximo 500KB.");
      return;
    }

    setUploadingUserIds(prev => new Set(prev).add(user.id));

    try {
      const storagePath = `avatars/${user.id}`;
      const downloadURL = await uploadFileViaApi(storagePath, file, {
        timeoutMs: 60000,
        onProgress: (progress) => {
          setUserUploadProgress(prev => ({ ...prev, [user.id]: progress }));
        }
      });
      
      await updateDoc(doc(db, 'users', user.id), { avatarUrl: downloadURL });
      alert("Avatar atualizado com sucesso!");
    } catch (error: any) {
      console.error("Error updating avatar:", error);
      alert(`Erro ao atualizar avatar: ${error.message}`);
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

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
    } catch (error) {
      console.error("Error updating role:", error);
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
      console.error("Error updating allowed banks:", error);
    }
  };

  const handlePermissionsChange = async (userId: string, permissions: string[]) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        permissions: permissions
      });
    } catch (error) {
      console.error("Error updating permissions:", error);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToResetPassword || !newPasswordForReset || !profile) return;

    setIsResettingPassword(true);
    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: userToResetPassword.id,
          newPassword: newPasswordForReset,
          adminUid: profile.uid,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Senha redefinida com sucesso!");
        setUserToResetPassword(null);
        setNewPasswordForReset('');
      } else {
        alert("Erro ao redefinir senha: " + data.error);
      }
    } catch (error: any) {
      console.error("Error resetting password:", error);
      alert("Erro ao redefinir senha.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (profile?.role === 'promotora' && profile.maxUsers !== undefined && profile.maxUsers > 0) {
      const createdUsersCount = users.filter(u => u.createdBy === profile.uid).length;
      if (createdUsersCount >= profile.maxUsers) {
        setCreateError(`Limite de usuários atingido. Você pode cadastrar no máximo ${profile.maxUsers} usuários.`);
        return;
      }
    }

    setIsCreating(true);

    // To create a user without signing out the current admin, 
    // we initialize a temporary secondary firebase app.
    const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const newUser = userCredential.user;

      let avatarUrl = '';
      if (newLogoFile) {
        try {
          const fileExt = newLogoFile.name.split('.').pop() || 'png';
          const storagePath = `avatars/${newUser.uid}.${fileExt}`;
          avatarUrl = await uploadFileViaApi(storagePath, newLogoFile, {
            timeoutMs: 60000
          });
        } catch (uploadError: any) {
          console.error("Error uploading new user logo:", uploadError);
          // We don't throw here to allow user creation even if avatar fails
        }
      }

      // Create profile in Firestore
      await setDoc(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: newEmail,
        name: newName,
        role: newRole,
        avatarUrl: avatarUrl,
        photoUrl: avatarUrl, // Set both for compatibility
        status: 'active', // Admin created users are active by default
        createdAt: serverTimestamp(),
        createdBy: profile?.uid || null,
        allowedBanks: []
      });

      // If it's a promotora, also create initial settings
      if (newRole === 'promotora') {
        await setDoc(doc(db, 'settings', newUser.uid), {
          loginImageUrl: avatarUrl,
          primaryColor: '#1152d4',
          promoterName: newName,
          updatedAt: serverTimestamp()
        });
      }

      // Sign out from the secondary app and delete it
      await signOut(secondaryAuth);
      
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
    } catch (error: any) {
      console.error("Error creating user:", error);
      setCreateError(error.message || "Erro ao criar usuário");
    } finally {
      setIsCreating(false);
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
  }, [users, profile, searchTerm, startDate, endDate, statusFilter, sortBy, sortOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background-light dark:bg-background-dark">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 shadow-2xl">
      {/* Header */}
      <header className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-10">
        <Link href="/dashboard" className="size-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-bold text-lg">Gerenciar Usuários</h1>
        <button 
          onClick={() => setIsAddingUser(true)}
          className="size-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        <QuotaAlert />
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

            <button 
              onClick={handleOpenGlobalBranding}
              className="w-full mb-6 flex items-center justify-between p-4 bg-primary/10 border border-primary/20 rounded-2xl text-primary font-bold transition-all hover:bg-primary/20"
            >
              <div className="flex items-center gap-3">
                <Palette className="w-5 h-5" />
                <span>Personalizar Portal</span>
              </div>
              <ChevronRight className={`w-5 h-5 transition-transform ${showBranding ? 'rotate-90' : ''}`} />
            </button>

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
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="minha-promotora"
                        className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    {slug && (
                      <p className="text-[10px] text-slate-400 ml-1 mt-1">
                        Seu link será: <span className="text-primary font-bold">{window.location.origin}/p/{slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')}</span>
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
                            src={imageFile ? URL.createObjectURL(imageFile) : loginImageUrl} 
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
                          <span className="text-[10px] opacity-60">Formatos: JPG, PNG (máx. 800KB)</span>
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
                            alert("URL copiada!");
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
                    <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 mb-2">
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
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-sm"
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
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
                          className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="name">Nome</option>
                          <option value="email">E-mail</option>
                          <option value="createdAt">Data de Criação</option>
                        </select>
                        <button 
                          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-primary transition-all"
                        >
                          <ArrowUpDown className={`w-4 h-4 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setStatusFilter('all');
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
                    <PromotoraAvatar logoUrl={user.avatarUrl || user.photoUrl} name={user.name} className="size-10" />
                    <div className={`absolute inset-0 bg-black/50 rounded-full flex items-center justify-center transition-opacity ${uploadingUserIds.has(user.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {uploadingUserIds.has(user.id) ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                          <span className="text-[8px] text-white font-bold mt-0.5">
                            {userUploadProgress[user.id] !== undefined ? `${userUploadProgress[user.id]}%` : 'Enviando...'}
                          </span>
                        </div>
                      ) : (
                        <ImageIcon className="w-4 h-4 text-white" />
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
                    <p className="text-[10px] text-slate-400">Criado por: {user.createdBy || 'Sistema'}</p>
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
                    <button
                      onClick={() => handleDeleteUser(user)}
                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                {(profile?.role === 'admin' || (profile?.role === 'promotora' && user.role !== 'admin' && user.role !== 'promotora')) && (
                  <button
                    onClick={() => {
                      let promotoraId = user.role === 'promotora' ? user.id : user.createdBy;
                      
                      // If it's an admin-created user or the user is an admin, use 'admin' for global branding
                      // We check if the user was created by the current admin or if role is admin
                      if (user.role === 'admin' || !promotoraId) {
                        promotoraId = 'admin';
                      }
                      
                      // If current user is admin and the target user's creator is an admin (not a promotora)
                      // This is a bit tricky, but usually admin-created users have the admin's UID as createdBy
                      // We'll check if the createdBy exists in our users list and what its role is
                      const creator = users.find(u => u.id === promotoraId);
                      if (creator && creator.role === 'admin') {
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
                <select 
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-xs focus:outline-none"
                  disabled={
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
                    className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <h2 className="font-bold text-lg mb-4">Bancos Permitidos: {editingAllowedBanksUser.name}</h2>
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
                  <span className="text-sm">{bank.name}</span>
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
                <input
                  required
                  type="password"
                  value={newPasswordForReset}
                  onChange={(e) => setNewPasswordForReset(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
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
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-bold text-lg">Novo Usuário</h2>
              <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 flex flex-col gap-4">
              {createError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs text-center">
                  {createError}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Nome Completo</label>
                <input
                  required
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do agente"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">E-mail</label>
                <input
                  required
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="agente@empresa.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Senha Inicial</label>
                <input
                  required
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Logo / Avatar</label>
                <label 
                  htmlFor="new-user-logo"
                  className="w-full h-24 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all"
                >
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
    </div>
  );
}
