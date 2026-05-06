import { atom } from 'recoil'

export const editorResultState = atom({
  key: 'editorResultState',
  default: '',
})

export const pdfResultState = atom({
  key: 'pdfResultState',
  default: '',
})

export const markupResultState = atom({
  key: 'markupResultState',
  default: '',
})
