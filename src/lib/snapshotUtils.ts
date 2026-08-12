import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

let isCheckingSnapshot = false;

export const createMonthlySnapshot = async (month: string, year: number, data: any) => {
  const snapshotRef = collection(db, 'monthlySnapshots');
  return await addDoc(snapshotRef, {
    month,
    year,
    data,
    createdAt: new Date().toISOString(),
  });
};

export const createSnapshotNotification = async (snapshotId: string, message: string) => {
  const notificationRef = collection(db, 'monthlySnapshotNotifications');
  await addDoc(notificationRef, {
    snapshotId,
    message,
    status: 'unread',
    createdAt: new Date().toISOString(),
  });
};

export const checkAndCreateSnapshot = async (currentData: any) => {
  if (isCheckingSnapshot) return;
  isCheckingSnapshot = true;

  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthName = lastMonth.toLocaleString('default', { month: 'long' });
    const year = lastMonth.getFullYear();

    // Check if snapshot already exists
    const snapshotQuery = query(
      collection(db, 'monthlySnapshots'),
      where('month', '==', monthName),
      where('year', '==', year)
    );
    const snapshotDocs = await getDocs(snapshotQuery);

    if (snapshotDocs.empty) {
      // Create snapshot
      const snapshotRef = await createMonthlySnapshot(monthName, year, currentData);
      // Create notification
      await createSnapshotNotification(
        snapshotRef.id, 
        `The breakdown for ${monthName} ${year} is ready.`
      );
    }
  } catch (err) {
    console.error('Error checking or creating monthly snapshot:', err);
  } finally {
    isCheckingSnapshot = false;
  }
};

