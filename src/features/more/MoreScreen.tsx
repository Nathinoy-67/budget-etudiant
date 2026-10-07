import { useMemo } from 'react';
import { Screen } from '../../components/Screen';
import { List, Money, Row, Section } from '../../components/ui';
import { useData } from '../../hooks/useData';
import { useNav } from '../../stores/nav';
import { accountBalances, categoryBudgets } from '../../lib/budget';
import { memberBalances } from '../../lib/split';
import { monthlyEquivalent } from '../../lib/recurrence';

export function MoreScreen() {
  const { accounts, transactions, today, categories, period, recurrings, goals, groups, sharedExpenses, settings } = useData();
  const push = useNav((s) => s.push);

  const total = useMemo(() => {
    const b = accountBalances(accounts.filter((a) => !a.archived), transactions, today);
    return [...b.values()].reduce((s, v) => s + v, 0);
  }, [accounts, transactions, today]);
  const overBudgets = categoryBudgets(categories, transactions, period).filter((b) => b.level !== 'ok').length;
  const subs = recurrings.filter((r) => r.isSubscription && r.active);
  const subsMonthly = subs.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency, r.interval), 0);
  const myShared = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      const me = g.members.find((m) => m.isMe);
      if (!me) continue;
      sum += memberBalances(g.members, sharedExpenses.filter((e) => e.groupId === g.id)).get(me.id) ?? 0;
    }
    return sum;
  }, [groups, sharedExpenses]);

  return (
    <Screen title="Plus">
      <Section title="Mon argent">
        <List>
          <Row
            icon="zap"
            iconBg="#111111"
            title="Paiements Apple Pay"
            subtitle={settings.lastApplePayAt ? 'Ajout automatique activé' : 'Ajoute tes achats automatiquement'}
            value={settings.lastApplePayAt ? '✅' : undefined}
            chevron
            onClick={() => push('applepay')}
          />
          <Row icon="wallet" iconBg="#5B5BD6" title="Comptes" value={<Money cents={total} />} chevron onClick={() => push('accounts')} />
          <Row
            icon="pie"
            iconBg="#30A46C"
            title="Budgets"
            value={overBudgets ? `${overBudgets} ⚠️` : undefined}
            chevron
            onClick={() => push('budgets')}
          />
          <Row icon="repeat" iconBg="#0090FF" title="Opérations récurrentes" value={recurrings.length || undefined} chevron onClick={() => push('recurrings')} />
          <Row
            icon="card"
            iconBg="#8E4EC6"
            title="Abonnements"
            value={subs.length ? <><Money cents={subsMonthly} compact />/mois</> : undefined}
            chevron
            onClick={() => push('subscriptions')}
          />
        </List>
      </Section>

      <Section title="Projets">
        <List>
          <Row icon="target" iconBg="#F76B15" title="Objectifs d'épargne" value={goals.filter((g) => !g.archived).length || undefined} chevron onClick={() => push('goals')} />
          <Row
            icon="users"
            iconBg="#D6409F"
            title="Dépenses partagées"
            value={myShared ? <Money cents={myShared} colored sign /> : undefined}
            chevron
            onClick={() => push('shared')}
          />
          <Row icon="calculator" iconBg="#12A594" title="Simulateur « et si ? »" chevron onClick={() => push('simulator')} />
        </List>
      </Section>

      <Section title="Personnaliser">
        <List>
          <Row icon="tag" iconBg="#FFB224" title="Catégories" chevron onClick={() => push('categories')} />
          <Row icon="zap" iconBg="#E5484D" title="Raccourcis d'ajout express" chevron onClick={() => push('quickadds')} />
          <Row icon="sliders" iconBg="#8D8D8D" title="Réglages" subtitle="Thème, code PIN, sauvegarde, notifications" chevron onClick={() => push('settings')} />
        </List>
      </Section>
    </Screen>
  );
}
