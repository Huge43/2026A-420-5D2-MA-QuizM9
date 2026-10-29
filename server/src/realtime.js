
/**
 * Le temps réel, avec Socket.IO : une connexion par onglet, greffée au
 * serveur HTTP d'Express (même port, 3000, chemin /socket.io).
 *
 * Les ACTIONS restent en HTTP (rejoindre, avancer, répondre). Socket.IO sert
 * à l'autre sens : le serveur PRÉVIENT les navigateurs qu'une partie a
 * changé, au lieu d'attendre qu'ils le lui demandent.
 *
 * Ce que Socket.IO fait à notre place, comparé au WebSocket de la semaine 7 :
 * - des ÉVÉNEMENTS nommés plutôt qu'un champ `type`, sans JSON.parse ;
 * - les SALONS (rooms) : socket.join(code), puis io.to(code).emit(...) ;
 * - l'ACCUSÉ DE RÉCEPTION (ack) : une fonction qui répond à CET envoi ;
 * - la reconnexion automatique, côté navigateur.
 *
 * Les événements :
 *
 *   navigateur → serveur   'join', code, ack     suivre cette partie
 *                                                ack({ game }) ou ack({ error })
 *   serveur → navigateur   'state', game         l'état public complet
 *
 * À chaque changement, tout le salon reçoit l'état complet, pas seulement ce
 * qui a changé : un navigateur qui se reconnecte est ainsi à jour d'un seul
 * message.
 */
import { Server } from 'socket.io';
import * as repository from './repository/index.js';
import { closeQuestionIfExpired, publicState } from './game.js';

/** Le serveur Socket.IO ; null tant que attachRealtime n'a pas été appelé. */
let io = null;
const chats = new Map(); // code → [{ pseudo, message }]
let nextMessageId = 1; // pour que les messages aient un identifiant unique, même après redémarrage du serveur

function chatOf(code) {
  if (!chats.has(code)) {
    chats.set(code, { enabled: true, messages: [] });
  }

  return chats.get(code);
}

/** Greffe Socket.IO au serveur HTTP (celui que retourne app.listen). */
export function attachRealtime(server) {
  io = new Server(server);

  io.on('connection', (socket) => {
    socket.on('join', async (code, ack) => {
      if (typeof ack !== 'function') return;

      try {
        const game = await repository.findGameByCode(String(code));

        if (!game) {
          return ack({ error: 'Partie introuvable.' });
        }

        // Quitter les autres salons.
        for (const room of socket.rooms) {
          if (room !== socket.id) socket.leave(room);
        }

        // Enregistrer la partie et rejoindre son salon.
        socket.data.code = game.code;
        socket.join(game.code);

        ack({});
      } catch (err) {
        console.error(err);
        ack({ error: 'Erreur du serveur.' });
      }
    });

    
    socket.on('chat:send', async (message, ack) => {
      if (typeof ack !== 'function') return;

      try {
        const code = socket.data.code;

        if (!code) {
          return ack({ error: 'Suivez d’abord une partie.' });
        }

        const text =
          typeof message?.text === 'string'
            ? message.text.trim()
            : '';

        if (!text || text.length > 200) {
          return ack({
            error: 'Le message doit contenir entre 1 et 200 caractères.'
          });
        }

        const game = await repository.findGameByCode(code);

        const player = game
          ? await repository.findPlayer(game.id, message?.nickname)
          : null;

        if (!player) {
          return ack({
            error: 'Joueur introuvable dans cette partie.'
          });
        }

        const newMessage = {
          id: nextMessageId++,
          nickname: player.nickname,
          text,
          sentAt: Date.now()
        };

        chatOf(code).messages.push(newMessage);
        io.to(code).emit('chat:message', newMessage);
        ack({});
      } catch (err) {
        console.error(err);
        ack({ error: 'Erreur du serveur.' });
      }
    });


    // Rien à faire à la déconnexion : Socket.IO retire la connexion de ses
    // salons tout seul.
  });

  return io;
}

/** Envoie l'état de la partie à toutes les connexions qui la suivent. */
export async function broadcastState(code) {
  if (!io?.sockets.adapter.rooms.has(code)) return;

  io.to(code).emit('state', await publicState(code));
}

/**
 * Plus personne ne sonde : c'est le serveur qui clôt la question à son
 * échéance, puis qui prévient le salon.
 */
export function closeAtDeadline(code, deadline) {
  const timer = setTimeout(async () => {
    try {
      const game = await repository.findGameByCode(code);
      await closeQuestionIfExpired(game);
      await broadcastState(code);
    } catch (err) {
      console.error(err);
    }
  }, deadline - Date.now() + 100);

  timer.unref();
}
