import { supabase } from './supabase';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

interface SubscriptionHandler {
  onExpenseAdded?: (expense: any) => void;
  onPaymentRecorded?: (payment: any) => void;
  onMemberJoined?: (member: any) => void;
  onSettlementUpdated?: (settlement: any) => void;
  onError?: (error: Error) => void;
}

class RealtimeManager {
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscriptions: Map<string, SubscriptionHandler> = new Map();

  /**
   * Subscribe to group expense changes
   */
  subscribeToGroupExpenses(
    groupId: string,
    handler: SubscriptionHandler
  ): () => void {
    const channelKey = `group-expenses-${groupId}`;

    // Store handler for cleanup
    this.subscriptions.set(channelKey, handler);

    try {
      // Create channel for expenses table
      const channel = supabase
        .channel(`expenses-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'expenses',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            console.log('[v0] Expense added:', payload);
            handler.onExpenseAdded?.(payload.new);
          }
        )
        .on('error', (error) => {
          console.error('[v0] Realtime error:', error);
          handler.onError?.(new Error(`Realtime subscription error: ${error}`));
        })
        .subscribe((status) => {
          if (status === 'CLOSED') {
            console.log('[v0] Expenses subscription closed');
          }
        });

      this.channels.set(channelKey, channel);

      // Return unsubscribe function
      return () => {
        this.unsubscribe(channelKey);
      };
    } catch (error) {
      console.error('[v0] Error subscribing to expenses:', error);
      handler.onError?.(error as Error);
      return () => {};
    }
  }

  /**
   * Subscribe to settlements updates
   */
  subscribeToSettlements(
    groupId: string,
    handler: SubscriptionHandler
  ): () => void {
    const channelKey = `group-settlements-${groupId}`;

    this.subscriptions.set(channelKey, handler);

    try {
      const channel = supabase
        .channel(`settlements-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'settlements',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            console.log('[v0] Settlement updated:', payload);
            handler.onSettlementUpdated?.(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'settlements',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            console.log('[v0] Settlement created:', payload);
            handler.onSettlementUpdated?.(payload.new);
          }
        )
        .on('error', (error) => {
          console.error('[v0] Realtime error:', error);
          handler.onError?.(new Error(`Settlement subscription error: ${error}`));
        })
        .subscribe((status) => {
          if (status === 'CLOSED') {
            console.log('[v0] Settlements subscription closed');
          }
        });

      this.channels.set(channelKey, channel);

      return () => {
        this.unsubscribe(channelKey);
      };
    } catch (error) {
      console.error('[v0] Error subscribing to settlements:', error);
      handler.onError?.(error as Error);
      return () => {};
    }
  }

  /**
   * Subscribe to group member changes
   */
  subscribeToGroupMembers(
    groupId: string,
    handler: SubscriptionHandler
  ): () => void {
    const channelKey = `group-members-${groupId}`;

    this.subscriptions.set(channelKey, handler);

    try {
      const channel = supabase
        .channel(`members-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_members',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            console.log('[v0] Member joined:', payload);
            handler.onMemberJoined?.(payload.new);
          }
        )
        .on('error', (error) => {
          console.error('[v0] Realtime error:', error);
          handler.onError?.(new Error(`Member subscription error: ${error}`));
        })
        .subscribe((status) => {
          if (status === 'CLOSED') {
            console.log('[v0] Members subscription closed');
          }
        });

      this.channels.set(channelKey, channel);

      return () => {
        this.unsubscribe(channelKey);
      };
    } catch (error) {
      console.error('[v0] Error subscribing to members:', error);
      handler.onError?.(error as Error);
      return () => {};
    }
  }

  /**
   * Subscribe to activity log updates
   */
  subscribeToActivity(handler: SubscriptionHandler): () => void {
    const channelKey = 'activity-log';

    this.subscriptions.set(channelKey, handler);

    try {
      const channel = supabase
        .channel('activity-updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'activity_log',
          },
          (payload) => {
            console.log('[v0] Activity logged:', payload);
            // Handle any activity type
            const activity = payload.new;
            if (activity.activity_type === 'expense_added') {
              handler.onExpenseAdded?.(activity);
            } else if (activity.activity_type === 'payment_recorded') {
              handler.onPaymentRecorded?.(activity);
            } else if (activity.activity_type === 'member_joined') {
              handler.onMemberJoined?.(activity);
            }
          }
        )
        .on('error', (error) => {
          console.error('[v0] Realtime error:', error);
          handler.onError?.(new Error(`Activity subscription error: ${error}`));
        })
        .subscribe((status) => {
          if (status === 'CLOSED') {
            console.log('[v0] Activity subscription closed');
          }
        });

      this.channels.set(channelKey, channel);

      return () => {
        this.unsubscribe(channelKey);
      };
    } catch (error) {
      console.error('[v0] Error subscribing to activity:', error);
      handler.onError?.(error as Error);
      return () => {};
    }
  }

  /**
   * Unsubscribe from a specific channel
   */
  private async unsubscribe(channelKey: string) {
    const channel = this.channels.get(channelKey);
    if (channel) {
      try {
        await supabase.removeChannel(channel);
        this.channels.delete(channelKey);
        this.subscriptions.delete(channelKey);
        console.log(`[v0] Unsubscribed from ${channelKey}`);
      } catch (error) {
        console.error(`[v0] Error unsubscribing from ${channelKey}:`, error);
      }
    }
  }

  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll() {
    const promises = Array.from(this.channels.keys()).map((key) =>
      this.unsubscribe(key)
    );
    await Promise.all(promises);
    this.channels.clear();
    this.subscriptions.clear();
    console.log('[v0] All subscriptions cleaned up');
  }

  /**
   * Check if connected to realtime
   */
  async checkConnection(): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      return !error;
    } catch (error) {
      console.error('[v0] Connection check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const realtimeManager = new RealtimeManager();

// Type exports
export type { SubscriptionHandler, RealtimeChannel };
