import { NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    
    if (!db || !auth) {
      return NextResponse.json({ error: 'Firebase connection failed' }, { status: 500 });
    }

    const { uid, adminUid } = await request.json();

    if (!uid || !adminUid) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Verify the requester is an admin or the creator of the user
    const adminDoc = await db.collection('users').doc(adminUid).get();
    
    if (!adminDoc.exists) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const adminData = adminDoc.data();
    const targetUserDoc = await db.collection('users').doc(uid).get();
    
    if (!targetUserDoc.exists) {
      // If user doc is already missing, maybe we can still delete from auth if admin
      if (adminData?.role === 'admin') {
         await auth.deleteUser(uid).catch(e => console.warn("User already gone from Auth or error:", e));
         return NextResponse.json({ success: true, message: "User deleted from Auth (profile already missing)" });
      }
      return NextResponse.json({ error: 'User profile not found. If this user is an admin, deleting from auth must be manual.' }, { status: 404 });
    }

    const targetUserData = targetUserDoc.data();

    // Permission check: Admin can delete any, Promotora can only delete their own created users
    const canDelete = adminData?.role === 'admin' || (adminData?.role === 'promotora' && targetUserData?.createdBy === adminUid);

    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied to delete this user' }, { status: 403 });
    }

    // Delete from Firebase Auth
    try {
      await auth.deleteUser(uid);
    } catch (authError: any) {
      console.warn('Error deleting user from Auth:', authError);
      // Even if Auth deletion fails (e.g. user already deleted), we might want to continue or return success
      if (authError.code !== 'auth/user-not-found') {
        throw authError;
      }
    }

    // Note: We don't delete the Firestore document here because the client-side code 
    // in UsuariosAdmin handles that. Or we can do it here for "full deletion".
    // The user said "toda a exclusão dentro do sistema seja excluido do banco de dados", 
    // which usually means both Auth and DB.
    
    await db.collection('users').doc(uid).delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
