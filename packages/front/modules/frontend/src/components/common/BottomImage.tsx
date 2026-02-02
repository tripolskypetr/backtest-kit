import { useEffect, useState } from "react";
import { Style } from "react-style-tag";
import { Source } from "react-declarative";

const IMAGE_SIDE = "5vmin";
const IMAGE_LIST = [
  "/images/cubes.png",
  "/images/snow.png",
  "/images/square.png",
  "/images/triangle.png",
  "/images/dots.png",
];

const randomImage = () => {
  const currentMinute = Math.floor(Date.now() / 1000 / 60);
  const randomIndex = currentMinute % IMAGE_LIST.length;
  return IMAGE_LIST[randomIndex];
};

export const BottomImage = () => {
  const [imageSource, setImageSource] = useState(() => randomImage());

  useEffect(
    () =>
      Source.fromInterval(60_000).connect(() =>
        setImageSource(randomImage()),
      ),
    [],
  );

  return (
    <Style>
      {`
            body {
                background-position: top calc(100vh - ${IMAGE_SIDE} - 24px) right 24px !important;
                background-size: ${IMAGE_SIDE}, auto, contain !important;
                background-image: url("${imageSource}") !important;
            }
        `}
    </Style>
  );
};

export default BottomImage;
