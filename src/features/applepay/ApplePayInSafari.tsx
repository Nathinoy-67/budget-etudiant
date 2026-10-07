import { parseIncomingPayment, prettyMerchant } from '../../lib/merchant';
import { formatMoney } from '../../lib/money';

/**
 * Affichée quand le lien du raccourci s'ouvre dans Safari au lieu de l'appli installée.
 * Sur iPhone, Safari et l'appli de l'écran d'accueil ont des données séparées :
 * le paiement ne peut donc pas être enregistré ici.
 */
export function ApplePayInSafari() {
  const p = parseIncomingPayment(location.search);
  return (
    <div className="pt-safe pb-safe fixed inset-0 overflow-y-auto bg-bg px-6">
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-[48px]">🧭</p>
        <h1 className="mt-2 text-[26px] leading-tight font-bold">Ouvert dans Safari</h1>
        {p && (
          <p className="mt-3 text-[17px]">
            Paiement reçu : <strong>{prettyMerchant(p.merchant)}</strong> · <strong className="tabular">{formatMoney(p.amount)}</strong>
          </p>
        )}
        <p className="mt-4 text-[16px] text-label-2">
          Le lien s'est ouvert dans <strong className="text-label">Safari</strong> au lieu de l'appli <strong className="text-label">Budget</strong> de
          ton écran d'accueil. Sur iPhone, les deux ont des données séparées : ce paiement n'a donc <strong className="text-label">pas</strong> été
          enregistré dans ton budget.
        </p>
        <div className="mt-6 rounded-2xl bg-card p-4 text-left text-[15px]">
          <p className="mb-2 font-semibold">Que faire ?</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-label-2">
            <li>Ajoute ce paiement à la main dans l'appli Budget (bouton +).</li>
            <li>Signale-le : la configuration du raccourci devra être adaptée (une autre méthode existe).</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
