import {useState,useEffect} from 'react';
import {tenantStorageKey} from '../api';
export default function useWorkspaceState(key:string,initial:string){const scoped=tenantStorageKey('view:'+key);const [value,setValue]=useState(()=>{try{return sessionStorage.getItem(scoped)??initial}catch{return initial}});useEffect(()=>{try{sessionStorage.setItem(scoped,value)}catch{}},[scoped,value]);return [value,setValue] as const}
