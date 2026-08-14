/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Branch = 'Annex' | 'Ayigya';
export type Role = 'Manager' | 'Receptionist';
export type RoomStatus = 'Available' | 'Occupied' | 'Maintenance' | 'Cleaning' | 'occupied_hold' | 'vacant';
export type BookingStatus = 'Confirmed' | 'Pending' | 'CheckedIn' | 'CheckedOut' | 'Cancelled' | 'No Show' | 'locked' | 'checking_in' | 'paid' | 'checked_out';
export type PaymentStatus = 'Paid' | 'Unpaid' | 'Partial' | 'Partially Paid (50% Deposit)' | 'Partially Paid (Split)';

export type UserStatus = 'Active' | 'Inactive' | 'Disabled';

export interface User {
  id: string;
  email: string;
  password?: string; // Opt out in some outputs, but needed for mock database
  name: string;
  role: Role;
  branch?: Branch; // Undefined for Manager, specified for Receptionist
  assignedBranch?: Branch;
  createdAt: string;
  ip?: string;
  status?: UserStatus;
  lastShiftReset?: number;
  tutorialSeen?: boolean;
}

export interface StaffUpdateInput {
  id: string;
  email: string;
  name: string;
  branch: Branch;
  password?: string;
  status?: UserStatus;
}

export interface Room {
  id: string;
  roomNumber: string;
  roomType: string; // e.g. Single, Double, Deluxe, Suite, Executive
  price: number;
  status: RoomStatus;
  branch: Branch;
  amenities: string[];
  description?: string;
  maxGuests?: number;
  guestName?: string;
  normalBookingPrice?: number;
  normalBookingMaxGuests?: number;
  occasionBookingPrice?: number;
  occasionBookingMaxGuests?: number;
  monthlyPremiumPrice?: number;
}

export interface Booking {
  id: string;
  roomId: string;
  roomNumber: string;
  branch: Branch;
  guestName: string;
  guestContact: string;
  checkInDate: string;
  checkOutDate: string;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  receptionistId: string;
  receptionistName: string;
  createdAt: string;
  actualCheckOutDate?: string;
  amountPaid?: number;
  priorAmountPaid?: number;
  deposit?: number;
  amountReceived?: number;
  balance_due?: number;
  pending_payment?: number;
  guestEmail?: string;
  isOccasion?: boolean;
  guestCount?: number;
  lateCheckOutFeeApplied?: number;
  payRemainingOnCheckIn?: boolean;
  dateCreated?: any;
  totalRate?: number;
  isOccasionBooking?: boolean;
  roomType?: string;
  lodgeBranch?: string;
  paymentMethod?: string;
  occasionMaxGuests?: number;
  selectedMonth?: string;
  isMonthlyBooking?: boolean;
  occasionPrice?: number;
  normalMaxGuests?: number;
  normalPrice?: number;
  isFutureBooking?: boolean;
  isPartialDeposit?: boolean;
  bookingType?: string;
  discountType?: '5% Long-Stay' | 'Manual' | 'None' | '5% Long-Stay + Manual' | string;
  discountAmount?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: Role;
  branch: Branch | 'Global';
  action: string;
  details?: string;
}

export interface WalkInActivityInput {
  id?: string;
  serialNumber?: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  serviceType: string;
  totalPrice: number;
  amountPaid: number;
  paymentMethod: string;
  paymentStatus: string;
  receptionistId: string;
  receptionistName: string;
  branch: Branch;
  lodgeBranch?: string;
  timestamp?: string;
  dateCreated?: any;
}

export interface DrinkItem {
  id: string;
  name: string;
  price: number;
  category?: 'Soft Drink' | 'Energy Drink' | 'Water';
  inStock: boolean;
  branch: Branch | 'All';
  createdAt?: string;
}

export interface DrinkSaleItem {
  drinkId: string;
  drinkName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface DrinkSale {
  id: string;
  serialNumber?: string;
  items?: DrinkSaleItem[];
  // Legacy fields for backward compatibility
  drinkId?: string;
  drinkName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  roomId?: string;
  roomNumber?: string;
  guestName: string;
  guestContact?: string;
  paymentMethod: 'Cash' | 'Mobile Money' | 'Split (Cash + Momo)' | 'Unpaid (Add to Room Bill)' | 'Split (Paid & Unpaid)';
  splitCashAmount?: number;
  splitMomoAmount?: number;
  paidAmount?: number;
  unpaidAmount?: number;
  splitPaidMethod?: 'Cash' | 'Mobile Money';
  paymentStatus: 'Paid' | 'Unpaid' | 'Split';
  settledPaymentMethod?: 'Cash' | 'Mobile Money';
  bookingId?: string;
  receptionistId: string;
  receptionistName: string;
  branch: Branch;
  lodgeBranch?: string;
  timestamp: string;
  dateCreated?: any;
  status?: string;
  note?: string;
}

export interface HandoverItemBreakdown {
  id: string;
  type: 'Room Booking' | 'Walk-In Activity' | 'Payment Adjustment' | 'Drink Sale' | 'Audit Log';
  description: string;
  roomNumber?: string;
  guestName: string;
  serviceOrType: string;
  amount: number;
  paymentMethod: string;
  timestamp: string;
  isFutureBooking?: boolean;
  isPartialDeposit?: boolean;
  bookingType?: string;
  bookingId?: string;
  // Financial breakdown for audit
  totalStayCost?: number;
  depositAmount?: number;
  previousDeposits?: number;
  balanceSettled?: boolean;
  paymentCategory?: 'Check-in' | 'Balance Settlement' | 'Future Lock-In' | 'Extension' | string;
}

export interface HandoverRecord {
  id: string;
  receptionistId: string;
  receptionistName: string;
  branch: Branch;
  timestamp: string;
  roomCash: number;
  roomMomo: number;
  walkInCash: number;
  walkInMomo: number;
  drinkCash?: number;
  drinkMomo?: number;
  cashAmount: number;
  momoAmount: number;
  totalAmount: number;
  notes?: string;
  itemsBreakdown?: HandoverItemBreakdown[];
}

export interface GlobalSettings {
  checkInTime: string;
  checkOutTime: string;
  lateCheckOutFee: number;
  annexIp?: string;
  ayigyaIp?: string;
  allowedIpAddresses?: string[];
  enforceIpRestrictions?: boolean;
  logRetentionDays?: number; // Retention period in days (e.g., 180 for 6 months)
  autoPurgeEnabled?: boolean; // Automatic purge toggle
}

export interface PendingEditRequest {
  id: string;
  bookingId: string;
  branch: Branch;
  receptionistId: string;
  receptionistName: string;
  createdAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  
  // Current values
  currentRoomId: string;
  currentRoomNumber: string;
  currentCheckInDate: string;
  currentCheckOutDate: string;
  currentTotalPrice: number;
  currentPaymentStatus?: PaymentStatus;
  currentAmountPaid?: number;
  currentPaymentMethod?: string;

  // Proposed values
  proposedRoomId: string;
  proposedRoomNumber: string;
  proposedCheckInDate: string;
  proposedCheckOutDate: string;
  proposedTotalPrice: number;
  proposedPaymentStatus?: PaymentStatus;
  proposedAmountPaid?: number;
  proposedPaymentMethod?: string;
  splitCashAmount?: number;
  splitMomoAmount?: number;
  
  // Financial impact
  priceDifference: number; // Proposed total minus current total
  reason?: string;

  // Non-revenue details
  guestName?: string;
  guestContact?: string;
  guestEmail?: string;

  // Review tracking
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface PaymentRectificationRequest {
  id: string;
  bookingId: string;
  branch: Branch;
  receptionistId: string;
  receptionistName: string;
  createdAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  
  // Current values
  currentPaymentStatus: PaymentStatus;
  currentAmountPaid: number;
  currentPaymentMethod: string;
  
  // Proposed values
  proposedPaymentStatus: PaymentStatus;
  proposedAmountPaid: number;
  proposedPaymentMethod: string;
  
  reason?: string;
  
  // Review tracking
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}


