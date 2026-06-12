import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyD1A3ILiqJ2b876tRj6K7He1Z8qoQFLuAU',
  authDomain: 'atrium-acuity.firebaseapp.com',
  projectId: 'atrium-acuity',
  storageBucket: 'atrium-acuity.firebasestorage.app',
  messagingSenderId: '277957295876',
  appId: '1:277957295876:web:6fc4e013b1244f3bec1a51',
  measurementId: 'G-0VZ5M6QY5X',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

export const STATE_DOC = ['appState', 'main']
