import { io, Socket } from 'socket.io-client';
import { ref } from 'vue';

export const socket = ref<Socket | null>(null);
export const isConnected = ref(false);
export const playerId = ref('');

export function initSocket(existingPlayerId?: string): Promise<{ playerId: string; socketId: string }> {
  return new Promise((resolve, reject) => {
    try {
      const options: any = {
        transports: ['websocket', 'polling']
      };

      const s = io('/game', options);

      s.on('connect', () => {
        socket.value = s;
        isConnected.value = true;
      });

      s.on('connected', (data: { playerId: string; socketId: string }) => {
        playerId.value = data.playerId;
        sessionStorage.setItem('botany_player_id', data.playerId);
        resolve(data);
      });

      s.on('connect_error', (err) => {
        reject(err);
      });

      s.on('disconnect', () => {
        isConnected.value = false;
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function disconnectSocket() {
  if (socket.value) {
    socket.value.disconnect();
    socket.value = null;
    isConnected.value = false;
  }
}
