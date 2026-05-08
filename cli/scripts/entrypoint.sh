#!/bin/sh

if [ $# -gt 0 ]; then
  exec node /usr/local/lib/node_modules/@backtest-kit/cli/build/index.mjs "$@"
fi

if [ -z "$STRATEGY_FILE" ]; then
  echo "Error: STRATEGY_FILE is required"
  exit 1
fi

case "${MODE}" in
  backtest|live|paper|walker) ;;
  *)
    echo "Error: MODE must be one of: backtest, live, paper, walker (got: '${MODE:-<empty>}')"
    exit 1
    ;;
esac

ARGS="--${MODE} --symbol ${SYMBOL:-BTCUSDT}"

[ -n "$STRATEGY" ]  && ARGS="$ARGS --strategy $STRATEGY"
[ -n "$EXCHANGE" ]  && ARGS="$ARGS --exchange $EXCHANGE"
[ -n "$FRAME" ]     && ARGS="$ARGS --frame $FRAME"
[ -n "$UI" ]        && ARGS="$ARGS --ui"
[ -n "$TELEGRAM" ]  && ARGS="$ARGS --telegram"
[ -n "$VERBOSE" ]   && ARGS="$ARGS --verbose"
[ -n "$NO_CACHE" ]  && ARGS="$ARGS --noCache"
[ -n "$NO_FLUSH" ]  && ARGS="$ARGS --noFlush"

exec node /usr/local/lib/node_modules/@backtest-kit/cli/build/index.mjs $ARGS "$STRATEGY_FILE"
