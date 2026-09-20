import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from './Player.tsx';
import './styles.css';
const data=JSON.parse(document.getElementById('game-data')!.textContent!);
createRoot(document.getElementById('root')!).render(<Player doc={data.case} media={data.media}/>);
