import React from 'react';
import { Composition } from 'remotion';
import { ReadwellIntro } from './video';

export const RemotionRoot: React.FC = () => <Composition id="ReadwellIntro" component={ReadwellIntro} durationInFrames={2400} fps={30} width={1920} height={1080} />;
