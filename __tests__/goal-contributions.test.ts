import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockFirestore, type MockFirestore } from './setup';

// Test user ID
const TEST_USER_ID = 'test-user-123';

// Type helpers for test assertions
type GoalDoc = { currentAmount: number; contributions: Array<{ cycleItemId?: string; amount: number; id: string }> };
type ItemDoc = { status: string; totalPaidAmount?: number; isVariable?: boolean };

// Mock the database - this needs to be set before each test
let mockDb: MockFirestore;

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => mockDb,
}));

// Helper to create a mock request
function createRequest(method: string, body?: unknown) {
  return {
    method,
    json: async () => body,
    headers: new Map(),
  };
}

describe('Goal Contributions Integration Tests', () => {
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.clearAllMocks();
  });

  describe('Payment → Goal Contribution Flow', () => {
    it('should create goal contribution when adding payment to linked cycle item', async () => {
      // Setup: Create a goal and a linked cycle item
      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000, // R10,000
        currentAmount: 0,
        contributions: [],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings',
        amount: 100000, // R1,000
        status: 'upcoming',
        linkedGoalId: 'goal-1',
        isVariable: false,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 0,
        paidCount: 0,
      });

      // Import route handler dynamically to use mocked modules
      const { POST } = await import('@/app/api/cycle-items/[id]/pay/route');

      // Act: Add a payment
      const request = createRequest('POST', {
        amount: 100000,
        note: 'Monthly savings',
        date: '2024-01-15',
      });

      await POST(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Check goal was updated
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(100000);
      expect(goal?.contributions).toHaveLength(1);
      expect(goal?.contributions[0]).toMatchObject({
        amount: 100000,
        cycleItemId: 'item-1',
        cycleId: 'cycle-2024-01',
      });
    });

    it('should update goal contribution when editing payment amount', async () => {
      // Setup: Create a goal with existing contribution
      const existingContribution = {
        id: 'item-1-pay-123',
        amount: 50000,
        cycleItemId: 'item-1',
        cycleId: 'cycle-2024-01',
        date: new Date('2024-01-15'),
      };

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 50000,
        contributions: [existingContribution],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings',
        amount: 100000,
        status: 'partial',
        linkedGoalId: 'goal-1',
        totalPaidAmount: 50000,
        payments: [{ id: 'pay-123', amount: 50000, date: new Date('2024-01-15') }],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 50000,
      });

      // Import route handler
      const { POST } = await import('@/app/api/cycle-items/[id]/edit-payment/route');

      // Act: Edit the payment to increase amount
      const request = createRequest('POST', {
        paymentId: 'pay-123',
        amount: 75000, // Increased from 50000
        note: 'Updated savings',
      });

      await POST(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Check goal was updated with difference
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(75000); // 50000 + 25000 diff
    });

    it('should remove goal contribution when deleting payment', async () => {
      // Setup: Create a goal with existing contribution
      const existingContribution = {
        id: 'item-1-pay-123',
        amount: 50000,
        cycleItemId: 'item-1',
        cycleId: 'cycle-2024-01',
        date: new Date('2024-01-15'),
      };

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 50000,
        contributions: [existingContribution],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings',
        amount: 100000,
        status: 'partial',
        linkedGoalId: 'goal-1',
        totalPaidAmount: 50000,
        payments: [{ id: 'pay-123', amount: 50000, date: new Date('2024-01-15') }],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 50000,
      });

      // Import route handler
      const { POST } = await import('@/app/api/cycle-items/[id]/delete-payment/route');

      // Act: Delete the payment
      const request = createRequest('POST', { paymentId: 'pay-123' });

      await POST(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Check goal contribution was removed
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(0);
      expect(goal?.contributions).toHaveLength(0);
    });

    it('should remove all contributions when unpaying a cycle item', async () => {
      // Setup: Create a goal with multiple contributions from same item
      const contributions = [
        { id: 'item-1-pay-1', amount: 25000, cycleItemId: 'item-1', cycleId: 'cycle-2024-01' },
        { id: 'item-1-pay-2', amount: 25000, cycleItemId: 'item-1', cycleId: 'cycle-2024-01' },
        { id: 'item-2-pay-1', amount: 50000, cycleItemId: 'item-2', cycleId: 'cycle-2024-01' }, // Different item
      ];

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 100000,
        contributions,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings',
        amount: 50000,
        status: 'paid',
        linkedGoalId: 'goal-1',
        totalPaidAmount: 50000,
        payments: [
          { id: 'pay-1', amount: 25000 },
          { id: 'pay-2', amount: 25000 },
        ],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 100000,
        paidCount: 2,
      });

      // Import route handler
      const { PATCH } = await import('@/app/api/cycle-items/[id]/route');

      // Act: Unpay the item (revert to partial)
      const request = createRequest('PATCH', { status: 'partial' });

      await PATCH(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Check only item-1 contributions were removed
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(50000); // Only item-2 contribution remains
      expect(goal?.contributions).toHaveLength(1);
      expect(goal?.contributions[0].cycleItemId).toBe('item-2');
    });

    it('should remove contributions when deleting a cycle item', async () => {
      // Setup
      const contributions = [
        { id: 'item-1-pay-1', amount: 50000, cycleItemId: 'item-1', cycleId: 'cycle-2024-01' },
      ];

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 50000,
        contributions,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings',
        amount: 50000,
        status: 'paid',
        linkedGoalId: 'goal-1',
        totalPaidAmount: 50000,
        payments: [{ id: 'pay-1', amount: 50000 }],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 50000,
        totalCommitted: 50000,
        paidCount: 1,
        itemCount: 1,
      });

      // Import route handler
      const { DELETE } = await import('@/app/api/cycle-items/[id]/route');

      // Act: Delete the cycle item
      const request = createRequest('DELETE', {});

      await DELETE(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Check contribution was removed from goal
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(0);
      expect(goal?.contributions).toHaveLength(0);
    });

    it('should remove all contributions when deleting a cycle', async () => {
      // Setup: Multiple items with contributions
      const contributions = [
        { id: 'item-1-pay-1', amount: 50000, cycleItemId: 'item-1', cycleId: 'cycle-2024-01' },
        { id: 'item-2-pay-1', amount: 75000, cycleItemId: 'item-2', cycleId: 'cycle-2024-01' },
      ];

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 125000,
        contributions,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings 1',
        amount: 50000,
        status: 'paid',
        linkedGoalId: 'goal-1',
        payments: [{ id: 'pay-1', amount: 50000 }],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: 'cycle-2024-01',
        label: 'Savings 2',
        amount: 75000,
        status: 'paid',
        linkedGoalId: 'goal-1',
        payments: [{ id: 'pay-1', amount: 75000 }],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 125000,
        totalCommitted: 125000,
      });

      // Import route handler
      const { DELETE } = await import('@/app/api/cycles/[id]/route');

      // Act: Delete the cycle
      const request = createRequest('DELETE', {});

      await DELETE(request as never, { params: Promise.resolve({ id: 'cycle-2024-01' }) });

      // Assert: Check all contributions were removed from goal
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(0);
      expect(goal?.contributions).toHaveLength(0);
    });
  });

  describe('Link Payments to Goal', () => {
    it('should prevent duplicate contributions when linking already-linked payments', async () => {
      // Setup: Goal with existing contribution
      const existingContribution = {
        id: 'item-1-pay-123',
        amount: 50000,
        cycleItemId: 'item-1',
        cycleId: 'cycle-2024-01',
      };

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 50000,
        contributions: [existingContribution],
      });

      // Setup: Cycle item with the payment (required for validation)
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings',
        amount: 50000,
        status: 'paid',
        payments: [{ id: 'pay-123', amount: 50000, date: new Date('2024-01-15') }],
      });

      // Import route handler
      const { POST } = await import('@/app/api/goals/[id]/link-payments/route');

      // Act: Try to link the same payment again
      const request = createRequest('POST', {
        payments: [
          { paymentId: 'pay-123', cycleItemId: 'item-1', cycleId: 'cycle-2024-01', amount: 50000, date: '2024-01-15' },
        ],
      });

      const response = await POST(request as never, { params: Promise.resolve({ id: 'goal-1' }) });

      // Assert: Should return error
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('already linked');
    });

    it('should only add new contributions when some are duplicates', async () => {
      // Setup: Goal with one existing contribution
      const existingContribution = {
        id: 'item-1-pay-123',
        amount: 50000,
        cycleItemId: 'item-1',
        cycleId: 'cycle-2024-01',
      };

      mockDb._setDoc(`users/${TEST_USER_ID}/goals`, 'goal-1', {
        name: 'Emergency Fund',
        targetAmount: 1000000,
        currentAmount: 50000,
        contributions: [existingContribution],
      });

      // Setup: Cycle items with payments (required for validation)
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Savings 1',
        amount: 50000,
        status: 'paid',
        payments: [{ id: 'pay-123', amount: 50000, date: new Date('2024-01-15') }],
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-2', {
        cycleId: 'cycle-2024-01',
        label: 'Savings 2',
        amount: 75000,
        status: 'paid',
        payments: [{ id: 'pay-456', amount: 75000, date: new Date('2024-01-20') }],
      });

      // Import route handler
      const { POST } = await import('@/app/api/goals/[id]/link-payments/route');

      // Act: Link one existing and one new payment
      const request = createRequest('POST', {
        payments: [
          { paymentId: 'pay-123', cycleItemId: 'item-1', cycleId: 'cycle-2024-01', amount: 50000, date: '2024-01-15' }, // Duplicate
          { paymentId: 'pay-456', cycleItemId: 'item-2', cycleId: 'cycle-2024-01', amount: 75000, date: '2024-01-20' }, // New
        ],
      });

      const response = await POST(request as never, { params: Promise.resolve({ id: 'goal-1' }) });

      // Assert: Only new contribution was added
      expect(response.status).toBe(200);
      const goal = mockDb._getDoc(`users/${TEST_USER_ID}/goals`, 'goal-1') as GoalDoc | undefined;
      expect(goal?.currentAmount).toBe(125000); // 50000 + 75000
      expect(goal?.contributions).toHaveLength(2);
    });
  });

  describe('Variable Item Behavior', () => {
    it('should not auto-complete variable items when payment exceeds budget', async () => {
      // Setup
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Groceries',
        amount: 200000, // R2,000 budget
        status: 'upcoming',
        isVariable: true, // Variable item
        linkedGoalId: null,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 0,
        paidCount: 0,
      });

      // Import route handler
      const { POST } = await import('@/app/api/cycle-items/[id]/pay/route');

      // Act: Add payment that exceeds budget
      const request = createRequest('POST', {
        amount: 250000, // R2,500 - exceeds R2,000 budget
      });

      await POST(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Status should be partial, not paid
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1') as ItemDoc | undefined;
      expect(item?.status).toBe('partial');
      expect(item?.totalPaidAmount).toBe(250000);
    });

    it('should auto-complete non-variable items when payment meets budget', async () => {
      // Setup
      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        label: 'Rent',
        amount: 500000, // R5,000
        status: 'upcoming',
        isVariable: false, // Fixed item
        linkedGoalId: null,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycles`, 'cycle-2024-01', {
        totalPaid: 0,
        paidCount: 0,
      });

      // Import route handler
      const { POST } = await import('@/app/api/cycle-items/[id]/pay/route');

      // Act: Add payment equal to budget
      const request = createRequest('POST', {
        amount: 500000,
      });

      await POST(request as never, { params: Promise.resolve({ id: 'item-1' }) });

      // Assert: Status should be paid
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1') as ItemDoc | undefined;
      expect(item?.status).toBe('paid');
    });
  });

  describe('isVariable Propagation', () => {
    it('should propagate isVariable changes to existing cycle items', async () => {
      // Setup: Commitment and cycle item without isVariable
      mockDb._setDoc(`users/${TEST_USER_ID}/commitments`, 'commitment-1', {
        label: 'Groceries',
        amount: 200000,
        isVariable: false,
        isActive: true,
      });

      mockDb._setDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1', {
        cycleId: 'cycle-2024-01',
        commitmentId: 'commitment-1',
        label: 'Groceries',
        amount: 200000,
        status: 'partial', // In progress
        isVariable: false,
      });

      // Import route handler
      const { PATCH } = await import('@/app/api/commitments/[id]/route');

      // Act: Update commitment to be variable
      const request = createRequest('PATCH', { isVariable: true });

      await PATCH(request as never, { params: Promise.resolve({ id: 'commitment-1' }) });

      // Assert: Cycle item should also be updated
      const item = mockDb._getDoc(`users/${TEST_USER_ID}/cycleItems`, 'item-1') as ItemDoc | undefined;
      expect(item?.isVariable).toBe(true);
    });
  });
});
