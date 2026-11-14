import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { startModel } from './lib/model/client.ts'

startModel()

const target = document.getElementById('app')
if (!target) throw new Error('Missing #app element')
mount(App, { target })
