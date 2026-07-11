import { useCallback, useState } from "react";

import { makeStyles } from "../../styles";

import IconButton from "@mui/material/IconButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemButton from "@mui/material/ListItemButton";
import ListSubheader from '@mui/material/ListSubheader';
import Popover from "@mui/material/Popover";
import Button from "@mui/material/Button";
import List from "@mui/material/List";

import EnglishFlag from "../../icons/EnglishFlag";
import RussianFlag from "../../icons/RussianFlag";
import TurkishFlag from "../../icons/TurkishFlag";
import ChineseFlag from "../../icons/ChineseFlag";
import HindiFlag from "../../icons/HindiFlag";
import SpanishFlag from "../../icons/SpanishFlag";
import PortugueseFlag from "../../icons/PortugueseFlag";

import TranslateOutlined from "@mui/icons-material/TranslateOutlined";

import { Center, singleshot } from "react-declarative";
import { get } from "lodash";

import { localeMap, Locale, t } from "../../i18n";
import { alpha } from "@mui/material";

const ALLOWED_LOCALES = new Set<string>(Object.keys(localeMap));

const DEFAULT_LOCALE: Locale = "en";

type Icon = React.ComponentType<any>;

interface ILocale {
  locale: Locale;
  title: string;
  description: string;
  icon: Icon;
}

const GET_LOCALE_FN = singleshot(() => {
    const url = new URL(location.href, location.origin);
    const locale = url.searchParams.get("locale") ?? "";
    return ALLOWED_LOCALES.has(locale) ? (locale as Locale) : DEFAULT_LOCALE;
});

const useStyles = makeStyles()((theme) => ({
  root: {
    color: "white",
  },
  list: {
    minWidth: "350px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "stretch",
    fontWeight: "bold",
    opacity: 0.5,
    fontSize: "16px",
  },
  button: {
    pointerEvents: "none",
  },
  icon: {
    fontSize: "18px",
  },
  stretch: {
    flex: 1,
  },
  accient: {
    background: alpha(
      theme.palette.getContrastText(theme.palette.background.paper),
      0.04
    ),
  },
}));

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  tr: "Türkçe",
  zh: "中文",
  hi: "हिन्दी",
  es: "Español",
  pt: "Português",
};

const LOCALE_ICONS: Record<Locale, Icon> = {
  en: EnglishFlag,
  ru: RussianFlag,
  tr: TurkishFlag,
  zh: ChineseFlag,
  hi: HindiFlag,
  es: SpanishFlag,
  pt: PortugueseFlag,
};

const LOCALE_LIST: ILocale[] = Object.keys(localeMap).map(
  (locale) => ({
    locale: locale as Locale,
    title: get(LOCALE_NAMES, locale),
    description: `/?locale=${locale}`,
    icon: get(LOCALE_ICONS, locale),
  }),
);

const handleChangeLocale = (locale: Locale) => {
	const url = new URL(window.location.href, window.location.origin);
	url.pathname = window.location.pathname;
	url.searchParams.set("locale", locale);
	window.location.href = url.toString();
}

export const LocalePicker = () => {

    const { classes, cx } = useStyles();

    const [locale] = useState(GET_LOCALE_FN);

    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const handleClose = useCallback(
      () =>
        setAnchorEl(null),
      []
    );

    // Шаблоны форм (src/assets) вызывают t() при инициализации модуля,
    // поэтому смена локали требует перезагрузки страницы
    const handlePick = useCallback((next: Locale) => {
      setAnchorEl(null);
      if (next === locale) {
        return;
      }
      handleChangeLocale(next);
    }, [locale]);

    return (
        <>
            <IconButton
              className={classes.root}
              onClick={({ currentTarget }) => {
                if (!anchorEl) {
                  setAnchorEl(currentTarget);
                }
              }}
              sx={{
                ml: {
                  xs: 1,
                  md: 2,
                },
                mr: {
                  xs: 1,
                  sm: 2,
                },
              }}
            >
                <TranslateOutlined />
            </IconButton>
            <Popover
                keepMounted
                open={!!anchorEl}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "center",
                }}
                transformOrigin={{
                    vertical: "top",
                    horizontal: "right",
                }}
            >
              <List 
                className={classes.list}
                subheader={
                  <ListSubheader className={classes.header}>
                    <span>{t("Locale")}</span>
                    <div className={classes.stretch} />
                    <TranslateOutlined className={classes.icon} />
                  </ListSubheader>
                }
              >
                {LOCALE_LIST.map(({ icon: Icon, ...item }, idx) => (
                  <ListItemButton
                    key={item.locale}
                    className={cx({
                      [classes.accient]: idx % 2 === 0,
                    })}
                    selected={item.locale === locale}
                    onClick={() => handlePick(item.locale)}
                  >
                    <Center pr={2}>
                      <Icon />
                    </Center>
                    <ListItemText
                      primary={item.title}
                      secondary={item.description}
                    />
                    <Button className={classes.button} variant="text">
                      {item.locale === locale ? t("Current Locale") : t("Select Locale")}
                    </Button>
                  </ListItemButton>
                ))}
              </List>
            </Popover>
        </>
    );
};

export default LocalePicker;
