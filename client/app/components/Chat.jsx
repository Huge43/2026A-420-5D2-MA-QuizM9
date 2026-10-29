import { useState } from 'react';

export default function Chat({ chat, sendMessage, pseudo }) {
    const [text, setText] = useState('');
    const [error, setError] = useState(null);

    async function send(event) {
        event.preventDefault();
        const reply = await sendMessage(pseudo, text);
        if (reply.error) {
            setError(reply.error);
        } else {
            setText('');
            setError(null);
        }
        
        return (
            <section className="card chat">
                <h2>Chat</h2>
                <ul className="chat-messages">
                    {chat.messages.map((m) => (
                        <li key={m.id}>
                            <strong>{m.nickname}</strong> : {m.text}
                    
                        </li>
                    ))}
                </ul>

                {pseudo && (
                    <form className="chat-form" onSubmit={send}>
                        <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Votre message…"
                        />
                        <button>Envoyer</button>
                    </form>
                )}
                {error && <p className="error">{error}</p>}
            </section>
        );
    }
}
