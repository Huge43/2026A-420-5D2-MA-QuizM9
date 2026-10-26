/**
 * Le crochet qui tient l'état de la partie à jour dans le navigateur.
 *
 * Une connexion Socket.IO reste ouverte, et le serveur envoie l'état complet
 * de la partie à chaque changement. Socket.IO se reconnecte tout seul (avec
 * un délai croissant) : plus de minuteur de reconnexion à écrire.
 */
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useGame(code) {
  const [game, setGame] = useState(null);

  useEffect(() => {
    if (!code) return;

    // Même hôte que la page : io() sans adresse. WebSocket seulement : sans
    // cette option, Socket.IO commence en HTTP (long polling) puis passe au
    // WebSocket, et nos relais (Vite, client/server.js) ne laissent passer
    // que le WebSocket.
    const socket = io({ transports: ['websocket'] });

    // 'connect' arrive à la première connexion ET à chaque reconnexion. Le
    // serveur a oublié nos salons entre-temps : on redit quelle partie on
    // suit, et sa réponse (l'ack) rattrape ce qu'on a manqué.
    socket.on('connect', () => {
      socket.emit('join', code, (reply) => {
        if (reply.game) setGame(reply.game);
      });
    });

    socket.on('state', setGame);

    // On quitte la page : on raccroche pour de bon, sans se reconnecter.
    return () => {
      socket.disconnect();
    };
  }, [code]);

  return game;
}
