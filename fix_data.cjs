const fs = require('fs');

let content = fs.readFileSync('src/data.ts', 'utf8');

// Import safeUpdateDoc
if (!content.includes('safeUpdateDoc')) {
  content = content.replace(/safeSetDoc, safeDeleteDoc/g, 'safeSetDoc, safeUpdateDoc, safeDeleteDoc');
}

// 1. updateRoomStatus
content = content.replace(
  /if \(db\) \{\s*safeSetDoc\(doc\(db, 'rooms', roomId\), rooms\[index\], \{ merge: true \}\);\s*\}/g,
  `if (db) {
      safeUpdateDoc(doc(db, 'rooms', roomId), { status: status });
    }`
);

// 2. updateRoom
content = content.replace(
  /if \(db\) \{\s*safeSetDoc\(doc\(db, 'rooms', roomId\), rooms\[index\], \{ merge: true \}\);\s*\}/g,
  `if (db) {
      safeSetDoc(doc(db, 'rooms', roomId), rooms[index], { merge: true }); // This one has a full update, but it's not used.
    }`
);

// 3. createBooking
content = content.replace(
  /if \(db\) \{\s*safeSetDoc\(doc\(db, 'rooms', room\.id\), room, \{ merge: true \}\);\s*safeSetDoc\(doc\(db, 'bookings', booking\.id\), booking, \{ merge: true \}\);\s*\}/g,
  `if (db) {
    safeUpdateDoc(doc(db, 'rooms', room.id), { status: 'Occupied' });
    safeSetDoc(doc(db, 'bookings', booking.id), booking, { merge: true });
  }`
);

// 4. checkoutBooking
content = content.replace(
  /if \(db\) \{\s*safeSetDoc\(doc\(db, 'bookings', bookingId\), bookings\[bookingIndex\], \{ merge: true \}\);\s*if \(roomIndex !== -1\) \{\s*safeSetDoc\(doc\(db, 'rooms', booking\.roomId\), rooms\[roomIndex\], \{ merge: true \}\);\s*\}\s*\}/g,
  `if (db) {
    safeUpdateDoc(doc(db, 'bookings', bookingId), {
      status: nextRoomStatus === 'Cleaning' ? 'CheckedOut' : 'CheckedOut',
      paymentStatus,
      totalPrice,
      lateCheckOutFee,
      paymentMethod,
      discountType,
      discountAmount
    });
    if (roomIndex !== -1) {
      safeUpdateDoc(doc(db, 'rooms', booking.roomId), { status: nextRoomStatus });
    }
  }`
);

// 5. cancelBooking
content = content.replace(
  /if \(db\) \{\s*safeSetDoc\(doc\(db, 'bookings', bookingId\), bookings\[bookingIndex\], \{ merge: true \}\);\s*if \(roomIndex !== -1\) \{\s*safeSetDoc\(doc\(db, 'rooms', booking\.roomId\), rooms\[roomIndex\], \{ merge: true \}\);\s*\}\s*\}/g,
  `if (db) {
    safeUpdateDoc(doc(db, 'bookings', bookingId), { status: 'Cancelled' });
    if (roomIndex !== -1) {
      safeUpdateDoc(doc(db, 'rooms', booking.roomId), { status: 'Available' });
    }
  }`
);

// 6. updateBookingPayment
content = content.replace(
  /if \(db\) \{\s*safeSetDoc\(doc\(db, 'bookings', bookingId\), bookings\[index\], \{ merge: true \}\);\s*\}/g,
  `if (db) {
    safeUpdateDoc(doc(db, 'bookings', bookingId), { paymentStatus: status });
  }`
);

fs.writeFileSync('src/data.ts', content, 'utf8');
console.log('Fixed data.ts updates to use safeUpdateDoc');
