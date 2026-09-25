/**
 * Single-Instance Protection Service
 *
 * Prevents multiple instances of Telegram Archive Viewer from running simultaneously
 * to ensure local SQLite file consistency and memory safety.
 * Works seamlessly across browser tabs, PWAs, and window instances.
 */

type MessageType =
  | { type: 'DISCOVERY_PING'; instanceId: string; timestamp: number }
  | { type: 'PRIMARY_ANNOUNCEMENT'; instanceId: string }
  | { type: 'FOCUS_PRIMARY_REQUEST' }
  | { type: 'CLAIM_PRIMARY'; newPrimaryId: string }
  | { type: 'PRIMARY_CLOSED'; instanceId: string };

type InstanceListener = (isDuplicate: boolean, primaryId: string | null) => void;

class InstanceService {
  private channel: BroadcastChannel | null = null;
  private instanceId: string = Math.random().toString(36).substring(2, 10);
  private isPrimary: boolean = true;
  private primaryInstanceId: string | null = null;
  private listeners: Set<InstanceListener> = new Set();
  private isChecking: boolean = true;

  constructor() {
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('tav_single_instance_guard');
        this.channel.onmessage = (event: MessageEvent<MessageType>) => {
          this.handleMessage(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported in current environment', e);
      }
    }

    // Announce presence to detect any existing active instance
    this.checkIfAnotherInstanceRunning();

    // Broadcast when closing window
    window.addEventListener('beforeunload', () => {
      if (this.isPrimary && this.channel) {
        this.channel.postMessage({
          type: 'PRIMARY_CLOSED',
          instanceId: this.instanceId,
        });
      }
    });
  }

  private checkIfAnotherInstanceRunning() {
    if (!this.channel) {
      this.isChecking = false;
      return;
    }

    // Send discovery ping
    this.channel.postMessage({
      type: 'DISCOVERY_PING',
      instanceId: this.instanceId,
      timestamp: Date.now(),
    });

    // Wait short time to hear from existing primary
    setTimeout(() => {
      this.isChecking = false;
      if (!this.primaryInstanceId) {
        // No primary answered, this instance is the primary
        this.isPrimary = true;
        this.primaryInstanceId = this.instanceId;
        this.notifyListeners(false, this.instanceId);
      }
    }, 250);
  }

  private handleMessage(data: MessageType) {
    if (!data) return;

    switch (data.type) {
      case 'DISCOVERY_PING': {
        if (data.instanceId !== this.instanceId && this.isPrimary) {
          // Another window just opened! Tell it we are primary and bring focus.
          if (this.channel) {
            this.channel.postMessage({
              type: 'PRIMARY_ANNOUNCEMENT',
              instanceId: this.instanceId,
            });
          }
          try {
            window.focus();
          } catch {}
        }
        break;
      }

      case 'PRIMARY_ANNOUNCEMENT': {
        if (data.instanceId !== this.instanceId) {
          // A primary instance already exists! Mark this instance as secondary/duplicate
          this.isPrimary = false;
          this.primaryInstanceId = data.instanceId;
          this.notifyListeners(true, data.instanceId);
        }
        break;
      }

      case 'FOCUS_PRIMARY_REQUEST': {
        if (this.isPrimary) {
          try {
            window.focus();
          } catch {}
        }
        break;
      }

      case 'CLAIM_PRIMARY': {
        if (data.newPrimaryId !== this.instanceId) {
          // Another tab claimed primary status
          this.isPrimary = false;
          this.primaryInstanceId = data.newPrimaryId;
          this.notifyListeners(true, data.newPrimaryId);
        }
        break;
      }

      case 'PRIMARY_CLOSED': {
        if (data.instanceId === this.primaryInstanceId && !this.isPrimary) {
          // The previous primary closed! Promote this instance
          this.isPrimary = true;
          this.primaryInstanceId = this.instanceId;
          this.notifyListeners(false, this.instanceId);
        }
        break;
      }
    }
  }

  public subscribe(listener: InstanceListener): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(!this.isPrimary && !this.isChecking, this.primaryInstanceId);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(isDuplicate: boolean, primaryId: string | null) {
    this.listeners.forEach((listener) => listener(isDuplicate, primaryId));
  }

  public focusPrimaryInstance() {
    if (this.channel) {
      this.channel.postMessage({ type: 'FOCUS_PRIMARY_REQUEST' });
    }
  }

  public claimPrimaryInstance() {
    this.isPrimary = true;
    this.primaryInstanceId = this.instanceId;
    if (this.channel) {
      this.channel.postMessage({
        type: 'CLAIM_PRIMARY',
        newPrimaryId: this.instanceId,
      });
    }
    this.notifyListeners(false, this.instanceId);
  }
}

export const instanceService = new InstanceService();
