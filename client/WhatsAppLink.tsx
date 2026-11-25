import { normalizeWhatsAppPhone } from './whatsapp-phone';
import logo from './assets/whatsapp-white.svg';
import './whatsapp.css';

export function WhatsAppLink({ phone, name }: { phone?: unknown; name: string }) {
  const number = normalizeWhatsAppPhone(phone);
  const label = number
    ? `Abrir WhatsApp de ${name} (nueva pestaña)`
    : `WhatsApp no disponible para ${name}`;
  return number ? (
    <a
      className="whatsapp-link"
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <img src={logo} width={28} height={28} alt="" aria-hidden="true" />
    </a>
  ) : (
    <span
      className="whatsapp-link whatsapp-unavailable"
      role="img"
      aria-disabled="true"
      aria-label={label}
      title={label}
    >
      —
    </span>
  );
}
