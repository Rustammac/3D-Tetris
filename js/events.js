/* ============ Простая событийная шина ============
   Модули общаются через события, не зная друг о друге:
   game -> (audio, hud, effects, scene)

   События:
   'move' 'rotate' 'hold' 'lock'            — действия фигуры
   'harddrop' {dist}                         — мгновенный сброс
   'clear'  {n, tspin, b2b, pts, combo, rows:[{r, colors[]}]}
   'levelup' {level}
   'scored'                                  — счёт изменился (обновить HUD)
   'danger' {on}                             — стек опасно высок
   'topout'                                  — игра окончена
*/
NT.events = (function () {
  var map = {};
  return {
    on: function (name, fn) {
      (map[name] || (map[name] = [])).push(fn);
    },
    emit: function (name, data) {
      var list = map[name];
      if (!list) return;
      for (var i = 0; i < list.length; i++) list[i](data);
    },
  };
})();
