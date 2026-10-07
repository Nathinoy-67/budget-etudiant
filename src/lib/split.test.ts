import { describe, expect, it } from 'vitest';
import type { Member, SharedExpense } from '../types';
import { equalSplits, memberBalances, minimalSettlements } from './split';

const members: Member[] = [
  { id: 'me', name: 'Moi', isMe: true },
  { id: 'lea', name: 'Léa' },
  { id: 'tom', name: 'Tom' },
];
let n = 0;
const exp = (paidBy: string, amount: number, among: string[]): SharedExpense => ({
  id: `e${n++}`,
  groupId: 'g',
  kind: 'expense',
  description: '',
  amount,
  paidBy,
  splits: equalSplits(amount, among),
  date: '2026-10-01',
  createdAt: 0,
});

describe('memberBalances', () => {
  it('la somme des soldes est toujours nulle', () => {
    const b = memberBalances(members, [exp('me', 9000, ['me', 'lea', 'tom']), exp('lea', 1000, ['me', 'lea', 'tom'])]);
    expect([...b.values()].reduce((a, x) => a + x, 0)).toBe(0);
    expect(b.get('me')).toBe(9000 - 3000 - 334);
    expect(b.get('tom')).toBe(-3000 - 333);
  });
  it('un remboursement solde la dette', () => {
    const settle: SharedExpense = {
      id: 's',
      groupId: 'g',
      kind: 'settlement',
      description: 'Remboursement',
      amount: 3000,
      paidBy: 'tom',
      splits: [{ memberId: 'me', share: 3000 }],
      date: '2026-10-02',
      createdAt: 0,
    };
    const b = memberBalances(members, [exp('me', 9000, ['me', 'lea', 'tom']), settle]);
    expect(b.get('tom')).toBe(0);
    expect(b.get('me')).toBe(3000);
  });
});

describe('minimalSettlements', () => {
  it('rembourse avec au plus n − 1 virements', () => {
    const b = new Map([
      ['a', 5000],
      ['b', -2000],
      ['c', -3000],
      ['d', 0],
    ]);
    const s = minimalSettlements(b);
    expect(s).toHaveLength(2);
    expect(s).toContainEqual({ from: 'c', to: 'a', amount: 3000 });
    expect(s).toContainEqual({ from: 'b', to: 'a', amount: 2000 });
  });
  it('appliquer les remboursements remet tout à zéro', () => {
    const b = new Map([
      ['a', 4000],
      ['b', 2500],
      ['c', -1500],
      ['d', -5000],
    ]);
    const s = minimalSettlements(b);
    const after = new Map(b);
    for (const x of s) {
      after.set(x.from, after.get(x.from)! + x.amount);
      after.set(x.to, after.get(x.to)! - x.amount);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
    expect(s.length).toBeLessThanOrEqual(3);
  });
  it('rien à faire si tout est soldé', () => {
    expect(minimalSettlements(new Map([['a', 0]]))).toEqual([]);
  });
});
