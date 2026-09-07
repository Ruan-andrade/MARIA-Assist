import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc, limit } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface Memory {
  id: string;
  content: string;
  category: string;
  createdAt: any;
}

export async function saveMemory(content: string, category: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const memoriesRef = collection(db, 'users', user.uid, 'memories');
  const docRef = await addDoc(memoriesRef, {
    content,
    category,
    ownerId: user.uid,
    createdAt: serverTimestamp()
  });

  return docRef.id;
}

export async function getMemories(maxItems: number = 20): Promise<Memory[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const memoriesRef = collection(db, 'users', user.uid, 'memories');
  const q = query(memoriesRef, orderBy('createdAt', 'desc'), limit(maxItems));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Memory[];
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  await deleteDoc(doc(db, 'users', user.uid, 'memories', memoryId));
}
