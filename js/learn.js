/* Themen-Einstieg: Leitfaden + Übungsrechnungen mit Zufallswerten (KEINE IHK-Aufgaben).
   Rechenwege nach IHK-Muster: Formel → Werte mit Einheiten einsetzen → Ergebnis mit Einheit.
   Die Formeln sind gegen Ergebnisse aus offiziellen IHK-Lösungsvorschlägen getestet (tests/learn.test.js). */
(function (root) {
  'use strict';
  const G_CU = 56;                                    // Leitfähigkeit Kupfer in m/(Ω·mm²), wie in den IHK-Lösungen
  const NQ = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95];
  const SQ3 = Math.sqrt(3);

  // ---------- Formeln (rein rechnerisch, getestet) ----------
  const F = {
    dU3: (l, I, cos, A) => SQ3 * l * I * cos / (G_CU * A),           // Spannungsfall Drehstrom
    A3: (l, I, cos, dU) => SQ3 * l * I * cos / (G_CU * dU),          // Querschnitt Drehstrom
    dU1: (l, I, cos, A) => 2 * l * I * cos / (G_CU * A),             // Spannungsfall Wechselstrom (Gleichstrom: cos = 1)
    A1: (l, I, cos, dU) => 2 * l * I * cos / (G_CU * dU),
    Pv1: (l, I, A) => 2 * I * I * l / (G_CU * A),                    // Leitungsverlust Hin- und Rückleiter
    Pv3: (l, I, A) => 3 * I * I * l / (G_CU * A),                    // Leitungsverlust Drehstrom (3 Außenleiter)
    nextNQ: a => NQ.find(q => q >= a - 1e-9),
    P3: (U, I, cos) => SQ3 * U * I * cos,                            // Wirkleistung Drehstrom
    I3: (P, U, cos) => P / (SQ3 * U * cos),
    M: (P, n) => P * 60 / (2 * Math.PI * n),                         // Drehmoment in Nm (P in W, n in 1/min)
    ns: (f, p) => 60 * f / p,                                        // Synchrondrehzahl (p = Polpaarzahl)
    slip: (ns, n) => (ns - n) / ns,
    tan: cos => Math.round(Math.tan(Math.acos(cos)) * 1000) / 1000,   // wie in den IHK-Lösungen auf 3 Stellen gerundet
    Qc: (P, c1, c2) => P * (F.tan(c1) - F.tan(c2)),
    C1ph: (Q, U, f) => Q / (U * U * 2 * Math.PI * f),                // Kapazität Wechselstrom
    Cdelta: (Q, U, f) => Q / (3 * U * U * 2 * Math.PI * f),          // je Kondensator in Dreieckschaltung (U = Außenleiterspannung)
    lamps: (E, A, Phi, eta) => E * A / (Phi * eta),                  // Wirkungsgradverfahren (eta = Raumwirkungsgrad × Wartungsfaktor)
    Em: (n, Phi, eta, A) => n * Phi * eta / A,
    pt100: (R0, a, t) => R0 * (1 + a * t),
    adcStep: (U, bits) => U / Math.pow(2, bits),
    ma2val: (I, lo, hi) => lo + (I - 4) / 16 * (hi - lo)              // 4–20 mA auf Messbereich
  };

  // ---------- Hilfen ----------
  const rnd = (a, b, step) => { const n = Math.round((a + Math.random() * (b - a)) / step); return +(n * step).toFixed(6); };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const fmt = (x, d) => { const v = d == null ? +x.toPrecision(4) : +x.toFixed(d); return v.toLocaleString('de-DE', { maximumFractionDigits: d == null ? 3 : d, useGrouping: false }); };
  const ask = (label, sym, value, unit, dec, tol) => ({ label, sym, value, unit, dec, tol: tol == null ? 0.02 : tol });

  // ---------- Themen ----------
  const TOPICS = [
    {
      key: 'leitung', topic: 'leitung', title: 'Leitungen & Spannungsfall', icon: 'bolt',
      intro: 'Kommt in Teil B fast jedes Mal: Querschnitt so wählen, dass der Spannungsfall eingehalten wird, und Spannungsfall bzw. Verlustleistung nachrechnen.',
      formulas: [
        ['Drehstrom', 'ΔU = √3 · l · I · cos φ / (γ · A)', 'A = √3 · l · I · cos φ / (γ · ΔU)'],
        ['Wechselstrom', 'ΔU = 2 · l · I · cos φ / (γ · A)', 'A = 2 · l · I · cos φ / (γ · ΔU)'],
        ['Gleichstrom', 'wie Wechselstrom, aber ohne cos φ (cos φ = 1)', ''],
        ['Verlustleistung', 'P_V = 2 · I² · l / (γ · A)  (Wechsel-/Gleichstrom)', 'P_V = 3 · I² · l / (γ · A)  (Drehstrom)'],
        ['Werte', 'γ (Kupfer) = 56 m/(Ω·mm²) · l = einfache Leitungslänge', 'ΔU in Volt: ΔU = Δu% · U (z. B. 3 % von 400 V = 12 V)']],
      steps: ['Zulässigen Spannungsfall in Volt ausrechnen (Prozent × Netzspannung).', 'Richtige Formel wählen: Drehstrom √3, Wechselstrom 2.', 'Formel hinschreiben, Werte mit Einheiten einsetzen, ausrechnen.', 'Nächstgrößeren Normquerschnitt wählen (1,5 · 2,5 · 4 · 6 · 10 · 16 · 25 mm² …).', 'Mit dem gewählten Querschnitt den tatsächlichen Spannungsfall nachrechnen, wenn gefragt.'],
      traps: ['√3 nur bei Drehstrom, 2 nur bei Wechsel-/Gleichstrom – nie beides.', 'l ist die einfache Länge (die 2 bzw. √3 steckt schon in der Formel).', 'Immer auf den nächstGRÖSSEREN Normquerschnitt runden, nie abrunden.', 'Falsche Folgeergebnisse geben bei der IHK 0 Punkte – Zwischenergebnisse prüfen.'],
      gens: [
        { name: 'Querschnitt Drehstrom', level: 2, make() {
          const U = 400, du = pick([3, 3, 4, 5]), l = rnd(20, 90, 1), I = rnd(8, 40, 0.5), c = pick([0.8, 0.82, 0.85, 0.86, 0.88]);
          const dU = U * du / 100, A = F.A3(l, I, c, dU), Q = F.nextNQ(A), dUq = F.dU3(l, I, c, Q);
          return { q: `Ein Drehstrommotor (400 V, I = ${fmt(I)} A, cos φ = ${fmt(c, 2)}) wird über eine ${l} m lange Kupferleitung angeschlossen. Der Spannungsfall darf ${du} % nicht überschreiten.`,
            asks: [ask('Zulässiger Spannungsfall', 'ΔU', dU, 'V', 2, 0.005), ask('Mindestquerschnitt', 'A', A, 'mm²', 2), ask('Gewählter Normquerschnitt', 'A_N', Q, 'mm²', 1, 0), ask('Spannungsfall mit A_N', 'ΔU', dUq, 'V', 2)],
            steps: [`ΔU = ${du} % · 400 V = ${fmt(dU, 2)} V`, `A = √3 · l · I · cos φ / (γ · ΔU) = √3 · ${l} m · ${fmt(I)} A · ${fmt(c, 2)} / (56 m/(Ω·mm²) · ${fmt(dU, 2)} V) = ${fmt(A, 2)} mm²`, `Gewählt: nächstgrößerer Normquerschnitt ${fmt(Q)} mm²`, `ΔU = √3 · ${l} m · ${fmt(I)} A · ${fmt(c, 2)} / (56 m/(Ω·mm²) · ${fmt(Q)} mm²) = ${fmt(dUq, 2)} V`] };
        } },
        { name: 'Spannungsfall Wechselstrom', level: 1, make() {
          const l = rnd(10, 60, 1), I = rnd(4, 16, 0.5), c = pick([1, 0.9, 0.95]), A = pick([1.5, 2.5, 4]);
          const dU = F.dU1(l, I, c, A), pct = dU / 230 * 100;
          return { q: `Ein Wechselstromverbraucher (230 V, I = ${fmt(I)} A${c < 1 ? `, cos φ = ${fmt(c, 2)}` : ', ohmsche Last'}) hängt an einer ${l} m langen Kupferleitung mit ${fmt(A)} mm².`,
            asks: [ask('Spannungsfall', 'ΔU', dU, 'V', 2), ask('Spannungsfall in Prozent', 'Δu', pct, '%', 2)],
            steps: [`ΔU = 2 · l · I · cos φ / (γ · A) = 2 · ${l} m · ${fmt(I)} A · ${fmt(c, 2)} / (56 m/(Ω·mm²) · ${fmt(A)} mm²) = ${fmt(dU, 2)} V`, `Δu = ΔU / U · 100 % = ${fmt(dU, 2)} V / 230 V · 100 % = ${fmt(pct, 2)} %`] };
        } },
        { name: 'Verlustleistung', level: 2, make() {
          const l = rnd(5, 40, 1), I = rnd(10, 70, 0.5), A = pick([4, 6, 10, 16]);
          const P = F.Pv1(l, I, A);
          return { q: `Eine Gleichstromleitung (Kupfer, ${fmt(A)} mm², einfache Länge ${l} m) führt ${fmt(I)} A.`,
            asks: [ask('Verlustleistung der Leitung', 'P_V', P, 'W', 2)],
            steps: [`P_V = 2 · I² · l / (γ · A) = 2 · (${fmt(I)} A)² · ${l} m / (56 m/(Ω·mm²) · ${fmt(A)} mm²) = ${fmt(P, 2)} W`] };
        } }
      ]
    },
    {
      key: 'motor', topic: 'motor', title: 'Drehstrom & Motoren', icon: 'timer',
      intro: 'Typenschild lesen und damit rechnen: Leistung, Strom, Wirkungsgrad, Drehmoment, Drehzahl und Schlupf.',
      formulas: [
        ['Leistung', 'P_zu = √3 · U · I · cos φ', 'I = P_zu / (√3 · U · cos φ)'],
        ['Wirkungsgrad', 'η = P_ab / P_zu', 'Auf dem Typenschild steht P_ab (abgegebene Wellenleistung)!'],
        ['Drehmoment', 'M = P · 60 / (2π · n)', 'P in W, n in 1/min → M in Nm'],
        ['Drehzahl', 'n_s = 60 · f / p', 'p = Polpaarzahl (4-polig → p = 2)'],
        ['Schlupf', 's = (n_s − n) / n_s', 'meist in % angegeben']],
      steps: ['Typenschild-Werte herausschreiben: P (abgegeben), U, I, cos φ, n.', 'Zugeführte Leistung mit √3 · U · I · cos φ berechnen.', 'Wirkungsgrad = abgegeben / zugeführt (immer < 1).', 'Drehmoment mit P in Watt und n in 1/min.'],
      traps: ['P auf dem Typenschild ist die ABGEGEBENE Leistung, nicht die zugeführte.', 'Bei Dreieck 400 V mit Außenleiterspannung 400 V und Außenleiterstrom rechnen.', 'kW in W umrechnen, bevor du ins Drehmoment einsetzt.', 'Polzahl ≠ Polpaarzahl: 4-polig heißt p = 2.'],
      gens: [
        { name: 'Wirkungsgrad vom Typenschild', level: 1, make() {
          const P = pick([1.1, 1.5, 2.2, 3, 4, 5.5, 7.5]) * 1000, c = pick([0.78, 0.8, 0.82, 0.84, 0.86]), eta = rnd(0.78, 0.9, 0.01);
          const Pzu = P / eta, I = +(Pzu / (SQ3 * 400 * c)).toFixed(1), Pzu2 = F.P3(400, I, c), e2 = P / Pzu2;
          return { q: `Typenschild eines Drehstrommotors: ${fmt(P / 1000)} kW · 400 V Δ · ${fmt(I, 1)} A · cos φ = ${fmt(c, 2)}.`,
            asks: [ask('Zugeführte Leistung', 'P_zu', Pzu2, 'W', 0), ask('Wirkungsgrad', 'η', e2, '', 3)],
            steps: [`P_zu = √3 · U · I · cos φ = √3 · 400 V · ${fmt(I, 1)} A · ${fmt(c, 2)} = ${fmt(Pzu2, 0)} W`, `η = P_ab / P_zu = ${fmt(P, 0)} W / ${fmt(Pzu2, 0)} W = ${fmt(e2, 3)}`] };
        } },
        { name: 'Drehmoment und Schlupf', level: 2, make() {
          const p = pick([1, 2, 2, 3]), f = 50, ns = F.ns(f, p), n = Math.round(ns * (1 - rnd(0.02, 0.06, 0.001))), P = pick([1.5, 2.2, 4, 5.5, 7.5, 11]) * 1000;
          const M = F.M(P, n), s = F.slip(ns, n) * 100;
          return { q: `Ein ${2 * p}-poliger Drehstrom-Asynchronmotor (50 Hz) gibt ${fmt(P / 1000)} kW bei ${n} 1/min ab.`,
            asks: [ask('Synchrondrehzahl', 'n_s', ns, '1/min', 0, 0), ask('Schlupf', 's', s, '%', 2), ask('Bemessungsdrehmoment', 'M', M, 'Nm', 2)],
            steps: [`p = ${p} (${2 * p} Pole) → n_s = 60 · f / p = 60 · 50 Hz / ${p} = ${ns} 1/min`, `s = (n_s − n) / n_s = (${ns} − ${n}) / ${ns} = ${fmt(s, 2)} %`, `M = P · 60 / (2π · n) = ${fmt(P, 0)} W · 60 / (2π · ${n} 1/min) = ${fmt(M, 2)} Nm`] };
        } },
        { name: 'Strom aus Leistung', level: 1, make() {
          const P = rnd(3, 30, 0.5) * 1000, c = pick([0.8, 0.85, 0.9, 0.95, 1]);
          const I = F.I3(P, 400, c);
          return { q: `Ein Drehstromverbraucher nimmt ${fmt(P / 1000)} kW Wirkleistung bei 400 V und cos φ = ${fmt(c, 2)} auf.`,
            asks: [ask('Außenleiterstrom', 'I', I, 'A', 2)],
            steps: [`I = P / (√3 · U · cos φ) = ${fmt(P, 0)} W / (√3 · 400 V · ${fmt(c, 2)}) = ${fmt(I, 2)} A`] };
        } }
      ]
    },
    {
      key: 'komp', topic: 'trafo', title: 'Blindleistungskompensation', icon: 'repeat',
      intro: 'Kondensatoren gleichen die induktive Blindleistung aus: erst Q_C über die tan-Werte, dann die Kapazität, oft noch der Strom nach der Kompensation.',
      formulas: [
        ['Blindleistung', 'Q_C = P · (tan φ₁ − tan φ₂)', 'tan φ aus cos φ: φ = arccos(cos φ), dann tan'],
        ['Wechselstrom', 'C = Q_C / (U² · ω)', 'ω = 2π · f = 314,16 1/s bei 50 Hz'],
        ['Drehstrom Dreieck', 'C_Δ = Q_C / (3 · U² · ω)', 'U = Außenleiterspannung (400 V), Wert je Kondensator'],
        ['Strom danach', 'I₂ = P / (U · cos φ₂)  bzw. Drehstrom  I₂ = P / (√3 · U · cos φ₂)', '']],
      steps: ['P bestimmen – bei Motoren die ZUGEFÜHRTE Leistung (P_ab / η).', 'tan φ₁ und tan φ₂ aus den cos-Werten berechnen.', 'Q_C = P · (tan φ₁ − tan φ₂).', 'Kapazität mit der passenden Formel (Wechselstrom oder Dreieck).'],
      traps: ['Bei Motoren: P_zu = P_ab / η einsetzen, nicht die Typenschildleistung.', 'Einheit: C kommt in Farad heraus – ×10⁶ für µF.', 'Bei Dreieck durch 3 teilen (Q je Strang) und mit 400 V rechnen.', 'tan-Werte nicht zu früh runden – sonst weicht C deutlich ab.'],
      gens: [
        { name: 'Kompensation Leuchte (Wechselstrom)', level: 2, make() {
          const P = rnd(40, 160, 1), c1 = pick([0.45, 0.5, 0.55, 0.6]), c2 = pick([0.9, 0.92, 0.95]);
          const Q = F.Qc(P, c1, c2), C = F.C1ph(Q, 230, 50) * 1e6, I2 = P / (230 * c2);
          return { q: `Eine Leuchte mit Drossel nimmt ${P} W bei 230 V / 50 Hz auf, cos φ₁ = ${fmt(c1, 2)}. Sie soll auf cos φ₂ = ${fmt(c2, 2)} kompensiert werden.`,
            asks: [ask('Kondensator-Blindleistung', 'Q_C', Q, 'var', 1), ask('Kapazität', 'C', C, 'µF', 2), ask('Strom nach Kompensation', 'I₂', I2, 'A', 3)],
            steps: [`tan φ₁ = ${fmt(F.tan(c1), 3)} · tan φ₂ = ${fmt(F.tan(c2), 3)}`, `Q_C = P · (tan φ₁ − tan φ₂) = ${P} W · (${fmt(F.tan(c1), 3)} − ${fmt(F.tan(c2), 3)}) = ${fmt(Q, 1)} var`, `C = Q_C / (U² · ω) = ${fmt(Q, 1)} var / ((230 V)² · 314,16 1/s) = ${fmt(C, 2)} µF`, `I₂ = P / (U · cos φ₂) = ${P} W / (230 V · ${fmt(c2, 2)}) = ${fmt(I2, 3)} A`] };
        } },
        { name: 'Kompensation Motor (Dreieck)', level: 3, make() {
          const Pab = pick([1.5, 2.2, 3, 4, 5.5]) * 1000, eta = pick([0.78, 0.8, 0.82, 0.85]), c1 = pick([0.78, 0.8, 0.83, 0.85]), c2 = pick([0.92, 0.95]);
          const Pzu = Pab / eta, Q = F.Qc(Pzu, c1, c2), C = F.Cdelta(Q, 400, 50) * 1e6;
          return { q: `Ein Drehstrommotor (P = ${fmt(Pab / 1000)} kW, η = ${fmt(eta, 2)}, cos φ₁ = ${fmt(c1, 2)}) soll mit drei Kondensatoren in Dreieckschaltung auf cos φ₂ = ${fmt(c2, 2)} kompensiert werden (400 V, 50 Hz).`,
            asks: [ask('Zugeführte Leistung', 'P_zu', Pzu, 'W', 0), ask('Kondensator-Blindleistung gesamt', 'Q_C', Q, 'var', 0), ask('Kapazität je Kondensator', 'C_Δ', C, 'µF', 2)],
            steps: [`P_zu = P_ab / η = ${fmt(Pab, 0)} W / ${fmt(eta, 2)} = ${fmt(Pzu, 0)} W`, `Q_C = P_zu · (tan φ₁ − tan φ₂) = ${fmt(Pzu, 0)} W · (${fmt(F.tan(c1), 3)} − ${fmt(F.tan(c2), 3)}) = ${fmt(Q, 0)} var`, `C_Δ = Q_C / (3 · U² · ω) = ${fmt(Q, 0)} var / (3 · (400 V)² · 314,16 1/s) = ${fmt(C, 2)} µF`] };
        } }
      ]
    },
    {
      key: 'kosten', topic: 'trafo', title: 'Energie, Kosten & Amortisation', icon: 'chart',
      intro: 'Einfach, aber sichere Punkte: Energie aus Leistung und Zeit, Kosten, Einsparung und wann sich eine Investition rechnet.',
      formulas: [
        ['Energie', 'W = P · t', 'P in kW, t in h → W in kWh'],
        ['Kosten', 'K = W · Arbeitspreis', 'z. B. 0,20 EUR/kWh'],
        ['Amortisation', 't = Investition / Einsparung pro Zeit', 'Ergebnis in Monaten oder Jahren']],
      steps: ['Leistung in kW umrechnen.', 'Betriebsstunden pro Jahr bilden (Stunden/Tag × Tage).', 'Energie und Kosten berechnen – bei Vergleichen die Differenz bilden.', 'Investition durch die Einsparung teilen.'],
      traps: ['W in kW rechnen, nicht in W (sonst Faktor 1000 daneben).', 'Bei mehreren Geräten die Anzahl nicht vergessen.', 'Ergebnis-Einheit angeben (Monate/Jahre).'],
      gens: [
        { name: 'Einsparung LED', level: 2, make() {
          const n = rnd(8, 40, 1), Palt = pick([36, 58, 60]), Pneu = pick([14, 18, 22, 24]), h = pick([8, 10, 12]), d = pick([220, 250, 300]), k = pick([0.2, 0.22, 0.25, 0.28]), inv = rnd(400, 2400, 50);
          const W = n * (Palt - Pneu) * h * d / 1000, K = W * k, t = inv / K * 12;
          return { q: `${n} Leuchten mit je ${Palt} W werden durch LED-Leuchten mit je ${Pneu} W ersetzt. Betrieb: ${h} h/Tag an ${d} Tagen/Jahr, Arbeitspreis ${fmt(k, 2)} EUR/kWh, Investition ${fmt(inv)} EUR.`,
            asks: [ask('Energieeinsparung pro Jahr', 'W', W, 'kWh', 1), ask('Kosteneinsparung pro Jahr', 'K', K, 'EUR', 2), ask('Amortisationszeit', 't', t, 'Monate', 1)],
            steps: [`W = n · ΔP · t = ${n} · (${Palt} W − ${Pneu} W) · ${h} h · ${d} = ${fmt(W, 1)} kWh`, `K = W · Arbeitspreis = ${fmt(W, 1)} kWh · ${fmt(k, 2)} EUR/kWh = ${fmt(K, 2)} EUR`, `t = Investition / Einsparung = ${fmt(inv)} EUR / ${fmt(K, 2)} EUR/Jahr · 12 = ${fmt(t, 1)} Monate`] };
        } }
      ]
    },
    {
      key: 'licht', topic: 'licht', title: 'Beleuchtung', icon: 'bulb',
      intro: 'Wirkungsgradverfahren: Wie viele Leuchten braucht ein Raum, und welche Beleuchtungsstärke ergibt sich?',
      formulas: [
        ['Anzahl Leuchten', 'n = E · A / (Φ · η)', 'η = Raumwirkungsgrad × Wartungsfaktor'],
        ['Beleuchtungsstärke', 'E = n · Φ · η / A', 'E in lx, Φ in lm, A in m²'],
        ['Lichtausbeute', 'η_L = Φ / P', 'in lm/W']],
      steps: ['Raumfläche A berechnen.', 'Gesamtwirkungsgrad bilden (Raumwirkungsgrad × Wartungsfaktor), wenn beide gegeben sind.', 'n ausrechnen und IMMER aufrunden.'],
      traps: ['Leuchtenanzahl immer auf ganze Leuchten AUFrunden.', 'Φ der Leuchte, nicht der einzelnen Lampe – bei mehreren Lampen je Leuchte multiplizieren.'],
      gens: [
        { name: 'Leuchtenanzahl', level: 2, make() {
          const a = rnd(6, 16, 0.5), b = rnd(5, 12, 0.5), E = pick([300, 500, 750]), Phi = pick([3300, 4300, 5200, 6800]), rw = pick([0.5, 0.6, 0.65, 0.7]), wf = pick([0.8, 0.67]);
          const A = a * b, eta = rw * wf, n = F.lamps(E, A, Phi, eta), N = Math.ceil(n - 1e-9);
          return { q: `Ein Raum (${fmt(a)} m × ${fmt(b)} m) soll mit ${E} lx beleuchtet werden. Leuchte: Φ = ${Phi} lm, Raumwirkungsgrad ${fmt(rw, 2)}, Wartungsfaktor ${fmt(wf, 2)}.`,
            asks: [ask('Raumfläche', 'A', A, 'm²', 2, 0.005), ask('Rechnerische Anzahl', 'n', n, '', 2), ask('Benötigte Leuchten', 'n', N, '', 0, 0)],
            steps: [`A = ${fmt(a)} m · ${fmt(b)} m = ${fmt(A, 2)} m²`, `n = E · A / (Φ · η_R · WF) = ${E} lx · ${fmt(A, 2)} m² / (${Phi} lm · ${fmt(rw, 2)} · ${fmt(wf, 2)}) = ${fmt(n, 2)}`, `Aufgerundet: ${N} Leuchten`] };
        } }
      ]
    },
    {
      key: 'mess', topic: 'mess', title: 'Mess- & Sensortechnik', icon: 'target',
      intro: 'Pt100, Normsignale und Analog-Digital-Umsetzer – kurze Rechnungen, die oft in Teil A und B vorkommen.',
      formulas: [
        ['Pt100', 'R = R₀ · (1 + α · Δϑ)', 'R₀ = 100 Ω bei 0 °C, α = 0,00385 1/K (Tabellenbuch)'],
        ['Normsignal', 'x = x_min + (I − 4 mA) / 16 mA · (x_max − x_min)', '4–20 mA linear auf den Messbereich'],
        ['ADU', 'Auflösung = U_max / 2ⁿ', 'n = Bitzahl']],
      steps: ['Gegebene Werte und Messbereich herausschreiben.', 'Formel aufstellen, einsetzen, rechnen.', 'Ergebnis plausibel? (z. B. 12 mA liegt genau in der Mitte des Bereichs)'],
      traps: ['Bei 4–20 mA beginnt der Bereich bei 4 mA, nicht bei 0.', 'α als 0,00385 1/K – nicht in Prozent einsetzen.'],
      gens: [
        { name: '4–20 mA umrechnen', level: 1, make() {
          const [lo, hi, unit] = pick([[0, 100, '°C'], [0, 150, '°C'], [-20, 80, '°C'], [0, 10, 'bar'], [0, 16, 'bar']]), I = rnd(4.5, 19.5, 0.1);
          const x = F.ma2val(I, lo, hi);
          return { q: `Ein Messumformer (4–20 mA) ist auf ${lo} … ${hi} ${unit} eingestellt. Gemessen werden ${fmt(I, 1)} mA.`,
            asks: [ask('Messwert', 'x', x, unit, 2)],
            steps: [`x = x_min + (I − 4 mA) / 16 mA · (x_max − x_min) = ${lo} ${unit} + (${fmt(I, 1)} mA − 4 mA) / 16 mA · ${hi - lo} ${unit} = ${fmt(x, 2)} ${unit}`] };
        } },
        { name: 'Pt100', level: 1, make() {
          const t = rnd(20, 180, 5), R = F.pt100(100, 0.00385, t);
          return { q: `Welchen Widerstand hat ein Pt100 (α = 0,00385 1/K) bei ${t} °C?`,
            asks: [ask('Widerstand', 'R', R, 'Ω', 2, 0.005)],
            steps: [`R = R₀ · (1 + α · Δϑ) = 100 Ω · (1 + 0,00385 1/K · ${t} K) = ${fmt(R, 2)} Ω`] };
        } },
        { name: 'ADU-Auflösung', level: 1, make() {
          const bits = pick([8, 10, 12]), U = pick([5, 10]);
          const s = F.adcStep(U, bits) * 1000;
          return { q: `Ein ${bits}-Bit-ADU hat einen Eingangsbereich von 0 … ${U} V.`,
            asks: [ask('Auflösung (kleinster Spannungsschritt)', 'ΔU', s, 'mV', 3)],
            steps: [`ΔU = U_max / 2ⁿ = ${U} V / 2^${bits} = ${U} V / ${Math.pow(2, bits)} = ${fmt(s, 3)} mV`] };
        } }
      ]
    }
  ];

  root.AP2Learn = { TOPICS, F, NQ, fmt };
  if (typeof module !== 'undefined') module.exports = root.AP2Learn;
})(typeof window !== 'undefined' ? window : globalThis);
