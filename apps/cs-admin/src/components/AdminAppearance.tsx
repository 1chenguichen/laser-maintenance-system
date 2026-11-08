import React, {createContext, useContext, useLayoutEffect, useState, useEffect} from 'react';
import {ConfigProvider, theme as antdTheme} from 'antd';
export const ADMIN_THEMES=[
 {id:'white',name:'纯白',accent:'#27272a',description:'黑白极简工作台'},
 {id:'black',name:'曜石黑',accent:'#a9c8ff',description:'深色工作台'},
 {id:'forest',name:'森林绿',accent:'#176c50',description:'现有默认风格'},
 {id:'blue',name:'专业蓝',accent:'#175fc4',description:'清晰的业务工作台'},
 {id:'violet',name:'鸢尾紫',accent:'#6650ae',description:'柔和的协作空间'},
 {id:'sand',name:'暖砂棕',accent:'#88552c',description:'温暖的中性纸感'},
 {id:'graphite',name:'石墨灰',accent:'#46566b',description:'克制的数据界面'},
];
const KEY='laser_admin_appearance_v1';
function valid(value:string|null){return ADMIN_THEMES.some(t=>t.id===value)?value!:'forest'}
const Appearance=createContext({selected:'forest',select:(_:string)=>{}});
export function AdminAppearance({children}:{children:React.ReactNode}){
 const [selected,setSelected]=useState(()=>{try{return valid(localStorage.getItem(KEY))}catch{return 'forest'}});
 useLayoutEffect(()=>{document.documentElement.dataset.adminTheme=selected;},[selected]);
 useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===KEY)setSelected(valid(event.newValue))};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[]);
 const select=(value:string)=>{const next=valid(value);setSelected(next);try{localStorage.setItem(KEY,next)}catch{}};
 const theme=ADMIN_THEMES.find(t=>t.id===selected)!;
 return <Appearance.Provider value={{selected,select}}><ConfigProvider theme={{algorithm:selected==='black'?antdTheme.darkAlgorithm:antdTheme.defaultAlgorithm,token:{colorPrimary:theme.accent,borderRadius:8}}}>{children}</ConfigProvider></Appearance.Provider>;
}
export function ThemeSwitcher(){const {selected,select}=useContext(Appearance);return <label className="admin-theme-control"><span>皮肤</span><select aria-label="后台皮肤" value={selected} onChange={e=>select(e.target.value)}>{ADMIN_THEMES.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>}
