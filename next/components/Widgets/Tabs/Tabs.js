import css from 'styled-jsx/css'
import React, {Children, cloneElement, useState} from "react"
import TabTitles from "./TabTitles";


export default function Tabs({children}) {

  const [activeIndex, setActiveIndex] = useState(0)

  const tabs = Children.map(children, (tab, tabIndex) => {
    return cloneElement(tab, {
      prev: tabIndex < activeIndex,
      next: tabIndex > activeIndex,
      active: tabIndex === activeIndex
    })
  })


  function activateTab(index) {
    setActiveIndex(index)
  }

  return <div className='tabs'>

    <TabTitles tabs={tabs} onTitleClick={activateTab}/>

    <div className="tabs-container">
      {tabs}
    </div>

    <style jsx>{style}</style>
  </div>
}


// language=Stylus
const style = css`
  .tabs {
    display flex
    flex-direction column
    flex-grow 1
    size 100%

    .tabs-container {
      position relative
      flex-grow 1
      overflow hidden
    }

  }

`
