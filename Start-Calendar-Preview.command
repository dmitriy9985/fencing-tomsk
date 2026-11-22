#!/bin/zsh

unsetopt BG_NICE

# Finder may launch this file outside the repository and with a minimal PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.deno/bin:$PATH"
cd -- "${0:A:h}" || exit 1

fail() {
  print -u2 -r -- "$1"
  if [[ -t 0 ]]; then
    print 'Нажмите Enter, чтобы закрыть запуск.'
    read -r
  fi
  exit 1
}

(( $+commands[deno] )) || fail 'Не найден Deno. Установите его по инструкции https://deno.com/ и снова откройте этот файл.'
preview=tests/browser/calendar-export-preview.mjs
[[ -r $preview ]] || fail 'Откройте этот файл из рабочей папки ветки work/calendar-export-links.'

port=8787
if /usr/sbin/lsof -nP -iTCP:$port -sTCP:LISTEN; then
  fail 'Порт 8787 занят. Если предпросмотр уже запущен, остановите его через Control+C в его окне. Чужой процесс не остановлен.'
fi

# Prefer Wi-Fi. If the hardware lookup is unavailable, use the physical default route.
wifi=$(/usr/sbin/networksetup -listallhardwareports 2>/dev/null |
  /usr/bin/awk '/^Hardware Port: (Wi-Fi|AirPort)$/ {getline; print $2; exit}')
physical=$(/usr/sbin/netstat -rn -f inet 2>/dev/null |
  /usr/bin/awk '$1 == "default" && $4 ~ /^en[0-9]+$/ {print $4; exit}')
address=127.0.0.1
for interface in "$wifi" "$physical"; do
  [[ -n $interface ]] || continue
  candidate=$(/sbin/ifconfig "$interface" 2>/dev/null |
    /usr/bin/awk '$1 == "inet" && ($2 ~ /^10\./ || $2 ~ /^192\.168\./ || $2 ~ /^172\.(1[6-9]|2[0-9]|3[01])\./) {print $2; exit}')
  if [[ -n $candidate ]]; then
    address=$candidate
    break
  fi
done

origin="http://$address:$port"
card="$origin/calendar/event/?id=11"
ics="$origin/functions/v1/calendar-event-ics/11.ics"
scratch=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/ffto-calendar.XXXXXXXX") ||
  fail 'Не удалось создать временную папку для проверки сервера.'

cleanup() {
  if [[ -n $server ]]; then
    kill "$server" 2>/dev/null
    wait "$server" 2>/dev/null
  fi
  /bin/rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 0' INT TERM HUP

export DENO_NO_UPDATE_CHECK=1
deno run --no-config --cached-only --no-prompt \
  --allow-read=calendar,js,images,fonts,styles.css --allow-net="$address:$port" \
  "$preview" "$address" >"$scratch/server.log" 2>&1 &
server=$!

print 'Запускаю локальный календарь ФФТО…'
ready=''
for attempt in {1..30}; do
  kill -0 "$server" 2>/dev/null || break
  if /usr/bin/curl --noproxy '*' -fsS --max-time 1 "$card" >"$scratch/card.html" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done
if [[ -z $ready ]] || ! /usr/bin/grep -q 'site-content.js' "$scratch/card.html" ||
  ! /usr/bin/curl --noproxy '*' -fsS --max-time 2 "$origin/js/site-content.js" -o "$scratch/site-content.js" ||
  ! /usr/bin/curl --noproxy '*' -fsS --max-time 2 -D "$scratch/headers" "$ics" -o "$scratch/ffto-event-11.ics" ||
  ! /usr/bin/grep -qi '^content-type: text/calendar' "$scratch/headers" ||
  ! /usr/bin/grep -qi '^content-disposition: inline' "$scratch/headers" ||
  ! /usr/bin/grep -q 'DTSTART;VALUE=DATE:20261219' "$scratch/ffto-event-11.ics" ||
  ! /usr/bin/grep -q 'DTEND;VALUE=DATE:20261221' "$scratch/ffto-event-11.ics"; then
  /bin/cat "$scratch/server.log" >&2
  fail 'Проверка HTTP не прошла. Проверьте разрешение «Локальная сеть» для Терминала в macOS, подключение Mac и порт 8787.'
fi

print ''
if [[ $address == 127.0.0.1 ]]; then
  print 'Подходящий локальный IPv4-адрес не найден. Предпросмотр доступен только на Mac.'
  print 'Подключите Mac и iPhone к одной частной сети Wi-Fi и перезапустите файл.'
else
  print 'Откройте в Safari на iPhone, подключённом к той же Wi-Fi-сети:'
fi
print -r -- "$card"
print ''
print 'На карточке нажмите «Добавить в календарь» → «Apple Календарь».'
print 'Если iPhone не видит Mac, откройте ссылку на Mac и скачайте .ics с карточки.'
print 'Оставьте окно открытым на время теста. Для остановки нажмите Control+C.'
wait "$server"
