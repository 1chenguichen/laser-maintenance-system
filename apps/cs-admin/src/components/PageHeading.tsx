import React from 'react';
export default function PageHeading({title,description,actions}:{title:string;description:string;actions?:React.ReactNode}){return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions&&<div className="page-heading-actions">{actions}</div>}</div>}
