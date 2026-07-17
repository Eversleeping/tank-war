import './style.css';
import { Game } from './game/Game.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const game = new Game(canvas, hud, overlay);
void game.start();
