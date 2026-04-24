const fs = require('fs');
      const lines = fs.readFileSync('example/content/feb_2026.strategy/assets/1m.jsonl', 'utf8').split('\n').filter(Boolean);

      const slTrades = [
        { label: 'Feb25-short', ts: 1771977600000, priceOpen: 64069.50, pos: 'short', slHit: 82 },
        { label: 'Feb13-short', ts: 1770940800000, priceOpen: 66275.92, pos: 'short', slHit: 912 },
        { label: 'Feb08-short', ts: 1770508800000, priceOpen: 69305.05, pos: 'short', slHit: 806 },
        { label: 'Feb26-long',  ts: 1772064000000, priceOpen: 67956.73, pos: 'long',  slHit: 2165 },
      ];

      for (const { label, ts, priceOpen, pos, slHit } of slTrades) {
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          const c = JSON.parse(lines[i]);
          if (c.timestamp >= ts) { idx = i; break; }
        }

        let peak = 0;
        const snapshots = [];
        for (let h = 1; h <= 48; h++) {
          const ci = idx + h * 60;
          if (ci >= lines.length) break;
          const c = JSON.parse(lines[ci]);
          const pnl = pos === 'short'
            ? (priceOpen - c.close) / priceOpen * 100
            : (c.close - priceOpen) / priceOpen * 100;
          if (pnl > peak) peak = pnl;
          snapshots.push({ h, pnl: pnl.toFixed(2), peak: peak.toFixed(2) });
        }

        console.log('=== ' + label + ' | SL hit at ' + slHit + ' min (' + (slHit/60).toFixed(1) + 'h) ===');
        snapshots.filter(s => s.h <= 6 || s.h % 4 === 0).forEach(s =>
          console.log('  h'+String(s.h).padStart(2)+': pnl='+String(s.pnl).padStart(6)+'%  peak='+String(s.peak).padStart(5)+'%')
        );
        console.log('');
      }