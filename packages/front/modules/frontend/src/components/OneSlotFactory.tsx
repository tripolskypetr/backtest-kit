import * as React from 'react';

import { OneSlotFactory as OneSlotFactoryInternal } from 'react-declarative';

import { OneDefaultSlots } from "react-declarative-mantine";

interface IOneSlotFactoryProps {
    children: React.ReactNode;
}

export const defaultSlots = {
    Choose: OneDefaultSlots.Choose,
    Combo: OneDefaultSlots.Combo,
    ComboArray: OneDefaultSlots.ComboArray,
    Complete: OneDefaultSlots.Complete,
    Date: OneDefaultSlots.Date,
    Items: OneDefaultSlots.Items,
    Text: OneDefaultSlots.Text,
    Time: OneDefaultSlots.Time,
    Tree: OneDefaultSlots.Tree,
    YesNo: OneDefaultSlots.YesNo,
    Switch: OneDefaultSlots.Switch,
    Radio: OneDefaultSlots.Radio,
    Slider: OneDefaultSlots.Slider,
    CheckBox: OneDefaultSlots.CheckBox,
};

export const OneSlotFactory = ({
    children
}: IOneSlotFactoryProps) => (
    <OneSlotFactoryInternal
        {...defaultSlots}
    >
        {children}
    </OneSlotFactoryInternal>
);

export default OneSlotFactory;
